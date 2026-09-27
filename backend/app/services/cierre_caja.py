"""Lectura de las hojas 'CAJA' de cierre diario (una por sucursal, se resetea
todos los días) y su comparación contra lo que el Tablero ya calcula de
'Mdz $'/'SJ $' + Transferencias.

Cada hoja trae uno o más bloques (uno por cajero/turno del día), cada uno con
su propia mini-tabla SISTEMA/REAL/DIFERENCIA para Transferencias, Efectivo,
Gastos y Total Cobrado. El layout es "suelto" (celdas sueltas en una posición
que varía de una sucursal a otra), así que en vez de asumir columnas fijas se
busca la celda literal "SISTEMA" y se lee todo relativo a esa posición:
  - el cajero está 2 filas arriba, misma columna que la etiqueta ("TRANSFERENCIAS" etc.)
  - la fecha está 1 fila arriba, misma columna
  - SISTEMA/REAL/DIFERENCIA/MOTIVO son esa columna +1/+2/+3/+4
"""

from datetime import date, datetime

from app.services.parsing import parse_amount

_MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}

_ETIQUETAS = ("TRANSFERENCIAS", "EFECTIVO", "GASTOS", "TOTAL COBRADO")

_ERRORES_FORMULA = {"#REF!", "#DIV/0!", "#N/A", "#VALUE!", "#NAME?", "#NULL!", "#NUM!"}


def _parse_monto(texto: str) -> float | None:
    """Como parse_amount, pero distingue una celda con error de fórmula (ej.
    '#REF!', visto en un cierre real) de una celda vacía: la vacía es $0
    (no hubo gastos, por ejemplo), la rota es "no se pudo leer" (None)."""
    if texto.strip().upper() in _ERRORES_FORMULA:
        return None
    return parse_amount(texto)


def _parse_fecha_larga(texto: str) -> date | None:
    """'viernes, 25 de septiembre de 2026' -> date(2026, 9, 25)."""
    texto = texto.strip().lower()
    if "," in texto:
        texto = texto.split(",", 1)[1].strip()
    partes = texto.split(" de ")
    if len(partes) != 3:
        return None
    dia_str, mes_str, anio_str = partes
    mes = _MESES.get(mes_str.strip())
    if mes is None or not dia_str.strip().isdigit() or not anio_str.strip().isdigit():
        return None
    try:
        return date(int(anio_str.strip()), mes, int(dia_str.strip()))
    except ValueError:
        return None


def _parse_bloques(values: list[list[str]], sucursal: str) -> list[dict]:
    bloques = []
    for r, row in enumerate(values):
        for c, celda in enumerate(row):
            if celda.strip().upper() != "SISTEMA":
                continue
            label_col = c - 1
            if label_col < 0:
                continue
            cajero = values[r - 2][label_col].strip() if r >= 2 and label_col < len(values[r - 2]) else ""
            fecha_str = values[r - 1][label_col].strip() if r >= 1 and label_col < len(values[r - 1]) else ""
            fecha = _parse_fecha_larga(fecha_str)
            if fecha is None:
                continue

            datos = {"fecha": fecha, "sucursal": sucursal, "caja": cajero or f"fila {r}"}
            for offset in range(1, 8):
                fila = r + offset
                if fila >= len(values) or label_col >= len(values[fila]):
                    break
                etiqueta = values[fila][label_col].strip().upper()
                if etiqueta not in _ETIQUETAS:
                    continue
                clave = etiqueta.lower().replace(" ", "_") if etiqueta != "TOTAL COBRADO" else "total"
                sistema = values[fila][c] if c < len(values[fila]) else ""
                real = values[fila][c + 1] if c + 1 < len(values[fila]) else ""
                diferencia = values[fila][c + 2] if c + 2 < len(values[fila]) else ""
                datos[f"{clave}_sistema"] = _parse_monto(sistema)
                datos[f"{clave}_real"] = _parse_monto(real)
                datos[f"{clave}_diferencia"] = _parse_monto(diferencia)
                if etiqueta == "TOTAL COBRADO":
                    break
            bloques.append(datos)
    return bloques


def get_cierres_del_dia(sheet_id: str, sucursal: str) -> list[dict]:
    from app.services.sheets import _get_values_cached

    values = _get_values_cached(sheet_id, "CAJA")
    return _parse_bloques(values, sucursal)


def get_comparativa_caja(sheet_consolidado_id: str, desde: date, hasta: date) -> list[dict]:
    """Compara lo que el Tablero calcula de 'Mdz $'/'SJ $' + Transferencias contra
    el REAL (conteo físico) de los cierres de caja guardados — sumando todas las
    cajas/cajeros del día por sucursal, ya que 'nuestro' es un total por sucursal,
    no por cajero."""
    from app.services import cierre_caja_store
    from app.services.sheets import get_ventas_diarias

    nuestro: dict[tuple[date, str], dict] = {}
    for row in get_ventas_diarias(sheet_consolidado_id):
        try:
            d, m, y = row["fecha"].split("/")
            fecha = date(int(y), int(m), int(d))
        except ValueError:
            continue
        if not (desde <= fecha <= hasta):
            continue
        nuestro[(fecha, "Mendoza")] = {"efectivo": row["mdz_efectivo"], "transferencias": row["mdz_transferencias"]}
        nuestro[(fecha, "San Juan")] = {"efectivo": row["sj_efectivo"], "transferencias": row["sj_transferencias"]}

    agrupado: dict[tuple[date, str], dict] = {}
    for f in cierre_caja_store.listar(desde, hasta):
        fecha = date.fromisoformat(f["fecha"])
        clave = (fecha, f["sucursal"])
        acc = agrupado.setdefault(clave, {"efectivo_real": 0.0, "transferencias_real": 0.0, "gastos_real": 0.0, "cajas": []})
        acc["efectivo_real"] += f.get("efectivo_real") or 0
        acc["transferencias_real"] += f.get("transferencias_real") or 0
        acc["gastos_real"] += f.get("gastos_real") or 0
        acc["cajas"].append(f["caja"])

    resultado = []
    for (fecha, sucursal), real in sorted(agrupado.items()):
        n = nuestro.get((fecha, sucursal), {"efectivo": 0.0, "transferencias": 0.0})
        resultado.append(
            {
                "fecha": fecha.isoformat(),
                "sucursal": sucursal,
                "cajas": real["cajas"],
                "nuestro_efectivo": round(n["efectivo"], 2),
                "nuestro_transferencias": round(n["transferencias"], 2),
                "real_efectivo": round(real["efectivo_real"], 2),
                "real_transferencias": round(real["transferencias_real"], 2),
                "real_gastos": round(real["gastos_real"], 2),
                "diferencia_efectivo": round(n["efectivo"] - real["efectivo_real"], 2),
                "diferencia_transferencias": round(n["transferencias"] - real["transferencias_real"], 2),
            }
        )
    return resultado
