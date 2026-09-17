import re
import time
from collections import defaultdict
from datetime import datetime

import gspread
from google.oauth2.service_account import Credentials

from app.config import GOOGLE_SERVICE_ACCOUNT_FILE
from app.services.parsing import parse_amount

SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

_client = None


def _get_client():
    global _client
    if _client is None:
        creds = Credentials.from_service_account_file(GOOGLE_SERVICE_ACCOUNT_FILE, scopes=SCOPES)
        _client = gspread.authorize(creds)
    return _client


# Cache en memoria de get_all_values() por hoja, con TTL corto. Varios widgets del
# panel piden el mismo sheet en la misma carga de página — sin esto se pisaba la
# cuota de lectura de Sheets (429/60 requests por minuto) con solo un par de
# recargas seguidas.
_VALUES_CACHE: dict[tuple[str, str], tuple[float, list[list[str]]]] = {}
_CACHE_TTL_SECONDS = 90


def _get_values_cached(sheet_id: str, worksheet_name: str) -> list[list[str]]:
    key = (sheet_id, worksheet_name)
    cached = _VALUES_CACHE.get(key)
    now = time.monotonic()
    if cached and now - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]
    values = _get_client().open_by_key(sheet_id).worksheet(worksheet_name).get_all_values()
    _VALUES_CACHE[key] = (now, values)
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


def get_resumen_proveedores(sheet_id: str) -> list[dict]:
    """Lee la hoja RESUMEN de PAGOS PROVEEDORES (encabezados en la fila 2)."""
    return _rows_from_values(_get_values_cached(sheet_id, "RESUMEN"), header_row=1)


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
