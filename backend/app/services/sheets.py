import gspread
from google.oauth2.service_account import Credentials

from app.config import GOOGLE_SERVICE_ACCOUNT_FILE

SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

_client = None


def _get_client():
    global _client
    if _client is None:
        creds = Credentials.from_service_account_file(GOOGLE_SERVICE_ACCOUNT_FILE, scopes=SCOPES)
        _client = gspread.authorize(creds)
    return _client


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
    sh = _get_client().open_by_key(sheet_id)
    ws = sh.worksheet("RESUMEN")
    return _rows_from_values(ws.get_all_values(), header_row=1)


def get_registro_diario(sheet_id: str) -> list[dict]:
    """Lee la hoja 'Registro Diario U$' del Consolidado Mdz y SJ."""
    sh = _get_client().open_by_key(sheet_id)
    ws = sh.worksheet("Registro Diario U$")
    return _rows_from_values(ws.get_all_values())


def get_resumen_local(sheet_id: str, hoja: str) -> list[dict]:
    """Lee una hoja 'Resumen $ + Transferencias' por local (Mdz o SJ)."""
    sh = _get_client().open_by_key(sheet_id)
    ws = sh.worksheet(hoja)
    return _rows_from_values(ws.get_all_values())
