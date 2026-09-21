import io
import math
import re
import time
from collections import defaultdict
from datetime import date, datetime

import json

import gspread
import requests
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.service_account import Credentials
from openpyxl import load_workbook

from app.config import GOOGLE_SERVICE_ACCOUNT_FILE, GOOGLE_SERVICE_ACCOUNT_JSON
from app.services import supabase_cache
from app.services.parsing import parse_amount

SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

_client = None


def _get_client():
    global _client
    if _client is None:
        if GOOGLE_SERVICE_ACCOUNT_JSON:
            info = json.loads(GOOGLE_SERVICE_ACCOUNT_JSON)
            creds = Credentials.from_service_account_info(info, scopes=SCOPES)
        else:
            creds = Credentials.from_service_account_file(GOOGLE_SERVICE_ACCOUNT_FILE, scopes=SCOPES)
        _client = gspread.authorize(creds)
    return _client


# --- Lectura de archivos Excel (.xlsx) subidos a Drive, no convertidos a
# Sheets nativo ---
#
# Algunas planillas (ej. PAGOS PROVEEDORES) las siguen editando terceros
# directamente en Excel — la API de Sheets no puede leer ese formato ("must
# not be an Office file"). Para esos casos bajamos el archivo crudo por la
# API de Drive (alt=media) y lo parseamos con openpyxl, sin tocar el archivo
# ni pedirle a nadie que lo convierta.
DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

_drive_creds = None


def _get_drive_token() -> str:
    global _drive_creds
    if _drive_creds is None:
        if GOOGLE_SERVICE_ACCOUNT_JSON:
            info = json.loads(GOOGLE_SERVICE_ACCOUNT_JSON)
            _drive_creds = Credentials.from_service_account_info(info, scopes=DRIVE_SCOPES)
        else:
            _drive_creds = Credentials.from_service_account_file(GOOGLE_SERVICE_ACCOUNT_FILE, scopes=DRIVE_SCOPES)
    if not _drive_creds.valid:
        _drive_creds.refresh(GoogleAuthRequest())
    return _drive_creds.token


def _cell_to_str(value) -> str:
    """Convierte un valor crudo de openpyxl al mismo formato de texto que ya
    devuelve gspread (get_all_values()), para que el resto del pipeline
    (parse_amount, parseo de fechas dd/mm/yyyy) no tenga que distinguir de
    dónde vino el dato."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, datetime):
        return f"{value.day}/{value.month}/{value.year}"
    if isinstance(value, (int, float)):
        return f"{value:.2f}".replace(".", ",")
    return str(value).strip()


# Sheets "es un Office file" se sabe recién al intentar abrirlo — una vez que
# lo detectamos para un sheet_id, lo recordamos para no reintentar la API de
# Sheets (que siempre va a fallar para ese archivo) en cada lectura.
_OFFICE_FILE_IDS: set[str] = set()

# Cache del workbook completo ya parseado (todas las hojas de una vez, para
# no volver a bajar 1-2 MB de Drive por cada pestaña que se lea del mismo
# archivo en una misma carga de página).
_XLSX_WORKBOOK_CACHE: dict[str, tuple[float, dict[str, list[list[str]]]]] = {}


def _download_xlsx_values(file_id: str) -> dict[str, list[list[str]]]:
    token = _get_drive_token()
    resp = requests.get(
        f"https://www.googleapis.com/drive/v3/files/{file_id}",
        params={"alt": "media"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
    )
    resp.raise_for_status()
    wb = load_workbook(io.BytesIO(resp.content), data_only=True, read_only=True)
    return {
        nombre: [[_cell_to_str(v) for v in row] for row in wb[nombre].iter_rows(values_only=True)]
        for nombre in wb.sheetnames
    }


def _get_xlsx_values_cached(file_id: str, worksheet_name: str) -> list[list[str]]:
    cached = _XLSX_WORKBOOK_CACHE.get(file_id)
    now = time.monotonic()
    if not cached or now - cached[0] >= _MEMORY_TTL_SECONDS:
        hojas = _download_xlsx_values(file_id)
        _XLSX_WORKBOOK_CACHE[file_id] = (now, hojas)
    else:
        hojas = cached[1]
    return hojas.get(worksheet_name, [])


def _fetch_fresh_values(sheet_id: str, worksheet_name: str) -> list[list[str]]:
    if sheet_id in _OFFICE_FILE_IDS:
        return _get_xlsx_values_cached(sheet_id, worksheet_name)
    try:
        return _get_client().open_by_key(sheet_id).worksheet(worksheet_name).get_all_values()
    except Exception as exc:
        if "Office file" not in str(exc):
            raise
        _OFFICE_FILE_IDS.add(sheet_id)
        return _get_xlsx_values_cached(sheet_id, worksheet_name)


# Dos capas de cache para los valores de una hoja:
# 1) memoria del proceso, TTL cortito — evita pegarle a Supabase por cada
#    widget que pide la misma hoja en la misma carga de página.
# 2) Supabase (supabase_cache), TTL más largo — sobrevive a un reinicio del
#    backend, a diferencia de la memoria. Sin esto se pisaba la cuota de
#    lectura de Sheets (429/60 requests por minuto) con solo un par de
#    recargas seguidas, y cada reinicio volvía a empezar de cero.
_VALUES_CACHE: dict[tuple[str, str], tuple[float, list[list[str]]]] = {}
_MEMORY_TTL_SECONDS = 30


def _get_values_cached(sheet_id: str, worksheet_name: str) -> list[list[str]]:
    key = (sheet_id, worksheet_name)
    cached = _VALUES_CACHE.get(key)
    now = time.monotonic()
    if cached and now - cached[0] < _MEMORY_TTL_SECONDS:
        return cached[1]

    remoto = supabase_cache.get(sheet_id, worksheet_name)
    if remoto is not None:
        _VALUES_CACHE[key] = (now, remoto)
        return remoto

    values = _fetch_fresh_values(sheet_id, worksheet_name)
    _VALUES_CACHE[key] = (now, values)
    supabase_cache.set(sheet_id, worksheet_name, values)
    return values


def _rows_from_values(values: list[list[str]], header_row: int = 0) -> list[dict]:
    """Arma una lista de dicts a mano, tolerando encabezados vacíos o repetidos
    (get_all_records de gspread falla si hay columnas sin nombre)."""
    headers = values[header_row]
    records = []
    for row in values[header_row + 1 :]:
        if not any(row):
            continue
        record = {headers[i]: (row[i] if i < len(row) else "") for i in range(len(headers)) if headers[i]}
        records.append(record)
    return records


def _moneda_ar(value: float) -> str:
    """Formatea con separadores argentinos (miles '.', decimales ',')."""
    return f"{value:,.2f}".replace(",", "\x00").replace(".", ",").replace("\x00", ".")


def get_resumen_proveedores(sheet_id: str) -> list[dict]:
    """Lee la hoja RESUMEN de PAGOS PROVEEDORES (encabezados en la fila 2).

    'Saldo' viene en la moneda nativa de cada proveedor (Sileo/Mundo Parts/Julio U.
    en pesos, Jona/The One en dólares) pero, al venir del Excel crudo, la celda es
    un número pelado sin ningún indicador de moneda — antes ese indicador lo traía
    gratis el texto formateado que devolvía la copia en Sheets. Se reconstruye
    comparando contra 'USD con TC Blue del dia': si coinciden, ya está en dólares;
    si no, está en pesos. El resto de la app (ProveedorCard, formatNativo) decide
    $/USD mirando si el string de Saldo contiene 'USD'.

    La hoja trae, además de las filas de proveedor, una fila final sin nombre con
    el total ya calculado (columna 'USD con TC Blue del dia'). Si no se descarta,
    cualquier suma sobre todas las filas termina contando el total dos veces."""
    filas = [
        f
        for f in _rows_from_values(_get_values_cached(sheet_id, "RESUMEN"), header_row=1)
        if f.get("Proveedor", "").strip()
    ]
    for fila in filas:
        crudo = fila.get("Saldo", "").strip()
        if not crudo:
            continue
        saldo = parse_amount(crudo)
        usd = parse_amount(fila.get("USD con TC Blue del dia", ""))
        es_usd = bool(saldo) and bool(usd) and abs(abs(saldo) - abs(usd)) / abs(saldo) < 0.05
        signo = "-" if saldo < 0 else ""
        numero = _moneda_ar(abs(saldo))
        fila["Saldo"] = f"{signo}USD {numero}" if es_usd else f"{signo}${numero}"
    return filas


def get_registro_diario(sheet_id: str) -> list[dict]:
    """Lee la hoja 'Registro Diario U$' del Consolidado Mdz y SJ."""
    return _rows_from_values(_get_values_cached(sheet_id, "Registro Diario U$"))


_FECHA_MIN = datetime(2020, 1, 1)


def _is_fecha_valida(fecha: str) -> bool:
    """Filtra filas con fecha vacía/corrupta (ej. '31/12/1969' de una celda mal
    formateada) o con fechas futuras cargadas por error."""
    try:
        parsed = datetime.strptime(fecha, "%d/%m/%Y")
    except ValueError:
        return False
    return _FECHA_MIN <= parsed <= datetime.now()


def _sum_by_date(values: list[list[str]], date_col: int, amount_cols: list[int]) -> dict[str, float]:
    """Replica la lógica de SUMIF de las hojas 'Resumen': suma amount_cols agrupado por date_col."""
    totals: dict[str, float] = defaultdict(float)
    for row in values[1:]:
        if len(row) <= date_col or not row[date_col].strip():
            continue
        fecha = row[date_col].strip()
        if not _is_fecha_valida(fecha):
            continue
        totals[fecha] += sum(parse_amount(row[c]) if c < len(row) else 0.0 for c in amount_cols)
    return totals


def sort_fechas(fechas) -> list[str]:
    """Ordena fechas 'dd/mm/yyyy' cronológicamente (un sort de string común las
    ordenaría mal, ej. '31/10/2024' antes que '05/09/2026')."""

    def _key(fecha: str):
        try:
            return datetime.strptime(fecha, "%d/%m/%Y")
        except ValueError:
            return datetime.min

    return sorted(fechas, key=_key)


def _sorted_dates(*date_dicts: dict[str, float]) -> list[str]:
    all_dates = set()
    for d in date_dicts:
        all_dates.update(d.keys())
    return sort_fechas(all_dates)


def get_ventas_diarias(sheet_id: str) -> list[dict]:
    """Ventas diarias por sucursal, separando transferencias de efectivo, replicando
    las fórmulas de 'Mdz/SJ Resumen $ + Transferencias' y 'CONSOLIDADO TOTAL $ +
    Transferencias' pero sobre el histórico completo en vez de un solo día a mano."""
    mdz_transf = _sum_by_date(_get_values_cached(sheet_id, "Mdz Transferencias"), date_col=0, amount_cols=[2, 4])
    sj_transf = _sum_by_date(_get_values_cached(sheet_id, "SJ Transferencias"), date_col=1, amount_cols=[4, 5])
    mdz_caja = _sum_by_date(_get_values_cached(sheet_id, "Mdz $"), date_col=1, amount_cols=[3])
    sj_caja = _sum_by_date(_get_values_cached(sheet_id, "SJ $"), date_col=1, amount_cols=[3])

    fechas = _sorted_dates(mdz_transf, sj_transf, mdz_caja, sj_caja)
    result = []
    for fecha in fechas:
        mt = mdz_transf.get(fecha, 0.0)
        mc = mdz_caja.get(fecha, 0.0)
        st = sj_transf.get(fecha, 0.0)
        sc = sj_caja.get(fecha, 0.0)
        result.append(
            {
                "fecha": fecha,
                "mdz_transferencias": round(mt, 2),
                "mdz_efectivo": round(mc, 2),
                "sj_transferencias": round(st, 2),
                "sj_efectivo": round(sc, 2),
                "mdz": round(mt + mc, 2),
                "sj": round(st + sc, 2),
                "transferencias": round(mt + st, 2),
                "efectivo": round(mc + sc, 2),
                "combinado": round(mt + mc + st + sc, 2),
            }
        )
    return result


def _sum_by_account(
    values: list[list[str]],
    date_col: int,
    pairs: list[tuple[int, int]],
    desde: datetime,
    hasta: datetime,
) -> dict[str, float]:
    """Agrupa por cuenta/banco (replica las QUERY de las hojas Resumen), filtrando por rango de fechas."""
    totals: dict[str, float] = defaultdict(float)
    for row in values[1:]:
        if len(row) <= date_col or not row[date_col].strip():
            continue
        fecha = row[date_col].strip()
        if not _is_fecha_valida(fecha):
            continue
        d = datetime.strptime(fecha, "%d/%m/%Y")
        if not (desde <= d <= hasta):
            continue
        for cuenta_col, monto_col in pairs:
            if cuenta_col >= len(row):
                continue
            cuenta = row[cuenta_col].strip().upper()
            cuenta = re.sub(r"^CUENTA\s+", "", cuenta)
            if not cuenta:
                continue
            monto = parse_amount(row[monto_col]) if monto_col < len(row) else 0.0
            if monto:
                totals[cuenta] += monto
    return totals


def get_transferencias_por_cuenta(sheet_id: str, desde: datetime, hasta: datetime) -> list[dict]:
    """Transferencias recibidas agrupadas por cuenta/banco (Mdz + SJ combinados) en un
    rango de fechas. Sirve para cruzar contra los saldos de PAGOS PROVEEDORES, ya que
    varias cuentas coinciden con proveedores (ej. 'THE ONE', 'SANTANDER')."""
    mdz = _sum_by_account(
        _get_values_cached(sheet_id, "Mdz Transferencias"),
        date_col=0,
        pairs=[(3, 2), (5, 4)],
        desde=desde,
        hasta=hasta,
    )
    sj = _sum_by_account(
        _get_values_cached(sheet_id, "SJ Transferencias"),
        date_col=1,
        pairs=[(3, 4), (3, 5)],
        desde=desde,
        hasta=hasta,
    )

    combinado: dict[str, float] = defaultdict(float)
    for cuenta, total in mdz.items():
        combinado[cuenta] += total
    for cuenta, total in sj.items():
        combinado[cuenta] += total

    return sorted(
        ({"cuenta": cuenta, "total": round(total, 2)} for cuenta, total in combinado.items()),
        key=lambda item: -item["total"],
    )


# 'Mdz $' y 'SJ $' comparten encabezado pero NO el mismo orden de columnas reales:
# en 'SJ $' "Motivo" y "Acumulado" están invertidos respecto a 'Mdz $' (verificado
# contra los datos crudos, no solo contra el encabezado).
_LIBROS_CAJA = {
    "Mdz $": {"date": 1, "gasto": 4, "salida": 5, "motivo": 7},
    "SJ $": {"date": 1, "gasto": 4, "salida": 5, "motivo": 6},
}

_CATEGORIAS_EGRESO = [
    ("SUELDO", "Sueldos"),
    ("DIF", "Diferencias de caja"),
    ("FALTANTE", "Diferencias de caja"),
    ("SOBRANTE", "Diferencias de caja"),
    ("DESAYUNO", "Desayuno"),
    ("CAMION", "Camionera / Flete"),
    ("USDT", "Compra USDT"),
    ("AGUA", "Servicios"),
    ("LUZ", "Servicios"),
    ("ALQUILER", "Alquiler"),
    ("CONTADOR", "Contador"),
]


def _categorizar_motivo(motivo: str) -> str:
    """Agrupa el texto libre de 'Motivo' en categorías. Es un heurístico por palabra
    clave (los datos originales no tienen una categoría estructurada) — ver
    _CATEGORIAS_EGRESO para ajustar las reglas."""
    m = motivo.upper()
    for keyword, categoria in _CATEGORIAS_EGRESO:
        if keyword in m:
            return categoria
    return "Otros"


def get_egresos_diarios(sheet_id: str) -> list[dict]:
    """Egresos diarios por sucursal (Gasto + Salida de caja)."""
    totales = {}
    for hoja, cols in _LIBROS_CAJA.items():
        totales[hoja] = _sum_by_date(
            _get_values_cached(sheet_id, hoja), date_col=cols["date"], amount_cols=[cols["gasto"], cols["salida"]]
        )

    fechas = _sorted_dates(*totales.values())
    return [
        {
            "fecha": fecha,
            "mdz": round(totales["Mdz $"].get(fecha, 0.0), 2),
            "sj": round(totales["SJ $"].get(fecha, 0.0), 2),
            "total": round(totales["Mdz $"].get(fecha, 0.0) + totales["SJ $"].get(fecha, 0.0), 2),
        }
        for fecha in fechas
    ]


def get_egresos_por_categoria(sheet_id: str, desde: datetime, hasta: datetime) -> list[dict]:
    """Egresos agrupados por categoría (heurística sobre 'Motivo'), separados por
    sucursal, en un rango de fechas. Incluye 'Sueldos' como una categoría más, ya
    separada por local."""
    por_categoria: dict[str, dict[str, float]] = defaultdict(lambda: {"mdz": 0.0, "sj": 0.0})

    branch_key = {"Mdz $": "mdz", "SJ $": "sj"}
    for hoja, cols in _LIBROS_CAJA.items():
        values = _get_values_cached(sheet_id, hoja)
        key = branch_key[hoja]
        for row in values[1:]:
            date_col = cols["date"]
            if len(row) <= date_col or not row[date_col].strip():
                continue
            fecha = row[date_col].strip()
            if not _is_fecha_valida(fecha):
                continue
            d = datetime.strptime(fecha, "%d/%m/%Y")
            if not (desde <= d <= hasta):
                continue
            monto = parse_amount(row[cols["gasto"]] if cols["gasto"] < len(row) else "") + parse_amount(
                row[cols["salida"]] if cols["salida"] < len(row) else ""
            )
            if not monto:
                continue
            motivo = row[cols["motivo"]].strip() if cols["motivo"] < len(row) else ""
            categoria = _categorizar_motivo(motivo) if motivo else "Otros"
            por_categoria[categoria][key] += monto

    return sorted(
        (
            {"categoria": cat, "mdz": round(v["mdz"], 2), "sj": round(v["sj"], 2), "total": round(v["mdz"] + v["sj"], 2)}
            for cat, v in por_categoria.items()
        ),
        key=lambda item: -item["total"],
    )


# --- Estimación de días para saldar cada cuenta corriente de proveedor ---
#
# Cada hoja de proveedor en PAGOS PROVEEDORES está armada a mano con su propia
# estructura (no hay un formato común, a diferencia de Mdz $/SJ $). Esto solo
# cubre los proveedores donde se pudo identificar con confianza una columna de
# "pago" limpia; Tradermax (hoja rota, "#REF!") y Merlo (columnas ambiguas)
# quedan afuera a pedido de Fer.
_PROVEEDOR_PAGO_CONFIG = {
    "SILEO": {"hoja": "SILEO", "date_col": 0, "pago_cols": [2, 3]},
    "JONA": {"hoja": "JONA", "date_col": 0, "pago_cols": [4]},
    "THE ONE": {"hoja": "The ONE", "date_col": 0, "pago_cols": [5]},
    "MUNDO PARTS": {"hoja": "MUNDO PARTS", "date_col": 0, "pago_cols": [2]},
    "JULIO U.": {"hoja": "JULIO U", "date_col": 0, "pago_cols": [4]},
}

_ULTIMOS_N_PAGOS = 20


def _parse_fecha_con_anio(fecha_str: str) -> datetime | None:
    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(fecha_str.strip(), fmt)
        except ValueError:
            continue
    return None


def _pagos_de_proveedor(sheet_id: str, config: dict) -> list[dict]:
    """Devuelve las filas con pago > 0 de una hoja de proveedor, con fecha resuelta,
    en el orden en que aparecen en la hoja (se asume cronológico, igual que el resto
    de estas planillas armadas a mano).

    La columna de fecha está "rellenada hacia abajo": solo la primera fila de cada
    día la tiene escrita, las siguientes filas de ese mismo día (otro cliente, otro
    pago) quedan con la celda vacía. Si no se arrastra la última fecha vista, se
    pierde la enorme mayoría de los pagos reales — verificado contra las 5 hojas de
    proveedor, entre 90% y 98% de los montos quedaban afuera por esto."""
    values = _get_values_cached(sheet_id, config["hoja"])
    date_col = config["date_col"]
    pagos = []
    ultima_fecha_str: str | None = None
    for row in values[1:]:
        if len(row) <= date_col:
            continue
        fecha_str = row[date_col].strip()
        if fecha_str:
            ultima_fecha_str = fecha_str
        elif ultima_fecha_str is not None:
            fecha_str = ultima_fecha_str
        else:
            continue

        monto = sum(parse_amount(row[c]) if c < len(row) else 0.0 for c in config["pago_cols"])
        if not monto:
            continue
        fecha = _parse_fecha_con_anio(fecha_str)
        if fecha is None:
            continue
        pagos.append({"monto": monto, "fecha": fecha})

    return pagos


def get_estimacion_pago_proveedores(sheet_id_pagos: str) -> list[dict]:
    """Estimación de días para saldar cada cuenta corriente, usando el ritmo de pago
    de los últimos 20 pagos registrados (ventana por cantidad, no por fecha, a
    pedido de Fer)."""
    resumen = get_resumen_proveedores(sheet_id_pagos)
    hoy = datetime.now().date()
    resultado = []

    for row in resumen:
        proveedor = row.get("Proveedor", "").strip()
        if not proveedor:
            continue
        config = _PROVEEDOR_PAGO_CONFIG.get(proveedor.upper())
        saldo = parse_amount(row.get("Saldo", ""))

        if not config:
            resultado.append({"proveedor": proveedor, "saldo": round(saldo, 2), "sin_datos": True})
            continue

        pagos = _pagos_de_proveedor(sheet_id_pagos, config)
        pago_hoy = sum(p["monto"] for p in pagos if p["fecha"].date() == hoy)

        ultimos = pagos[-_ULTIMOS_N_PAGOS:]
        dias_para_saldar = None
        pago_promedio_diario = None
        pago_promedio_por_pago = None
        intervalo_promedio_dias = None
        pagos_para_saldar = None
        if len(ultimos) >= 2 and saldo > 0:
            total_ultimos = sum(p["monto"] for p in ultimos)
            dias_span = max((ultimos[-1]["fecha"] - ultimos[0]["fecha"]).days, 1)
            pago_promedio_diario = total_ultimos / dias_span
            if pago_promedio_diario > 0:
                dias_para_saldar = saldo / pago_promedio_diario

            # Complementa la tasa diaria: si el proveedor cobra poco frecuente
            # (ej. 1 pago por semana), dividir por días de calendario da un
            # número chico que no se siente representativo — "cuántos pagos
            # como los últimos harían falta" es más intuitivo en esos casos.
            pago_promedio_por_pago = total_ultimos / len(ultimos)
            intervalo_promedio_dias = dias_span / (len(ultimos) - 1)
            if pago_promedio_por_pago > 0:
                pagos_para_saldar = math.ceil(saldo / pago_promedio_por_pago)

        resultado.append(
            {
                "proveedor": proveedor,
                "saldo": round(saldo, 2),
                "pago_hoy": round(pago_hoy, 2),
                "pago_promedio_diario": round(pago_promedio_diario, 2) if pago_promedio_diario else None,
                "dias_para_saldar": round(dias_para_saldar, 1) if dias_para_saldar else None,
                "pago_promedio_por_pago": round(pago_promedio_por_pago, 2) if pago_promedio_por_pago else None,
                "intervalo_promedio_dias": round(intervalo_promedio_dias, 1) if intervalo_promedio_dias else None,
                "pagos_para_saldar": pagos_para_saldar,
                "pagos_considerados": len(ultimos),
                "sin_datos": False,
            }
        )

    return resultado


# --- Módulos sin stock (hojas 'Lista Faltantes' / 'Faltantes Recuperados') ---
#
# Cada sucursal tiene su propia planilla de lista de precios con estas dos hojas.
# 'Lista Faltantes' son los artículos que HOY siguen sin stock (columna FECHA
# INGRESO = cuándo entraron a faltantes). 'Faltantes Recuperados' son los que ya
# se repusieron (FECHA SALIDA = cuándo volvieron a tener stock). No hay una
# categoría "MÓDULOS": son las categorías de marca sin prefijo (a diferencia de
# "BATERIAS X", "GLASS X", "PLACAS X") y sin contar "GENERAL" (que son baterías
# de otras marcas) — confirmado con Fer.
_PREFIJOS_NO_MODULO = ("BATERIAS", "GLASS", "PLACAS")


def _es_modulo(categoria: str) -> bool:
    cat = categoria.strip().upper()
    if not cat or cat == "GENERAL":
        return False
    return not any(cat.startswith(p) for p in _PREFIJOS_NO_MODULO)


def _parse_fecha_hora(fecha_str: str) -> datetime | None:
    """'FECHA INGRESO'/'FECHA SALIDA' vienen como 'dd/mm/yyyy HH:MM'."""
    fecha_str = fecha_str.strip()
    if not fecha_str:
        return None
    for fmt in ("%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            return datetime.strptime(fecha_str, fmt)
        except ValueError:
            continue
    return None


def _filas_modulo(sheet_id: str, hoja: str, sucursal: str) -> list[dict]:
    """Filas de módulos (categoría) de una hoja puntual ('Lista Faltantes' o
    'Faltantes Recuperados'). Separado de _modulos_activos/_modulos_del_dia para
    no leer 'Faltantes Recuperados' cuando no hace falta (el acumulado no la usa,
    y es la hoja más pesada de las dos)."""
    resultado = []
    for row in _rows_from_values(_get_values_cached(sheet_id, hoja)):
        categoria = row.get("LÍNEA / MARCA") or row.get("F") or row.get("LÍNEA/MARCA") or ""
        if not _es_modulo(categoria):
            continue
        fecha_ingreso = _parse_fecha_hora(row.get("FECHA INGRESO", ""))
        resultado.append(
            {
                "sucursal": sucursal,
                "categoria": categoria.strip(),
                "articulo": row.get("ARTÍCULO", "").strip(),
                "fecha_ingreso": fecha_ingreso,
            }
        )
    return resultado


def get_modulos_sin_stock_del_dia(sheet_mdz_id: str, sheet_sj_id: str, fecha: date) -> list[dict]:
    """Módulos que entraron a la lista de faltantes en la fecha dada (mira el
    histórico completo, no solo los que siguen activos, para poder consultar días
    pasados aunque ya se hayan repuesto)."""
    filas = [
        row
        for sheet_id, sucursal in ((sheet_mdz_id, "Mendoza"), (sheet_sj_id, "San Juan"))
        for hoja in ("Lista Faltantes", "Faltantes Recuperados")
        for row in _filas_modulo(sheet_id, hoja, sucursal)
    ]
    return [
        {"sucursal": r["sucursal"], "categoria": r["categoria"], "articulo": r["articulo"]}
        for r in filas
        if r["fecha_ingreso"] is not None and r["fecha_ingreso"].date() == fecha
    ]


def get_modulos_sin_stock_acumulado(sheet_mdz_id: str, sheet_sj_id: str) -> dict:
    """Total de módulos que siguen sin stock ahora mismo (no depende de la fecha
    elegida en el calendario — es el estado actual de 'Lista Faltantes'). No lee
    'Faltantes Recuperados': no hace falta para este cálculo."""
    activos_mdz = _filas_modulo(sheet_mdz_id, "Lista Faltantes", "Mendoza")
    activos_sj = _filas_modulo(sheet_sj_id, "Lista Faltantes", "San Juan")
    return {
        "mdz": len(activos_mdz),
        "sj": len(activos_sj),
        "total": len(activos_mdz) + len(activos_sj),
    }
