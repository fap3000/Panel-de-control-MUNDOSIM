import calendar
from datetime import datetime

from fastapi import APIRouter, HTTPException

from app.config import SHEET_CONSOLIDADO_ID
from app.services import sheets

router = APIRouter(prefix="/ventas", tags=["ventas"])


@router.get("/diarias")
def ventas_diarias():
    try:
        return sheets.get_ventas_diarias(SHEET_CONSOLIDADO_ID)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo calcular ventas diarias: {exc}") from exc


@router.get("/transferencias-por-cuenta")
def transferencias_por_cuenta(desde: str | None = None, hasta: str | None = None):
    """Sin parámetros, usa el mes calendario actual (mismo criterio que 'Periodo' en las hojas Resumen)."""
    try:
        if desde and hasta:
            desde_dt = datetime.strptime(desde, "%Y-%m-%d")
            hasta_dt = datetime.strptime(hasta, "%Y-%m-%d")
        else:
            hoy = datetime.now()
            ultimo_dia = calendar.monthrange(hoy.year, hoy.month)[1]
            desde_dt = hoy.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            hasta_dt = hoy.replace(day=ultimo_dia, hour=23, minute=59, second=59, microsecond=0)
        return sheets.get_transferencias_por_cuenta(SHEET_CONSOLIDADO_ID, desde_dt, hasta_dt)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo agrupar transferencias por cuenta: {exc}") from exc
