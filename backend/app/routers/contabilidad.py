import calendar
from datetime import datetime

from fastapi import APIRouter, HTTPException

from app.config import SHEET_CONSOLIDADO_ID
from app.services import sheets

router = APIRouter(prefix="/contabilidad", tags=["contabilidad"])


@router.get("/diario")
def diario():
    """Ingresos (mismo cálculo que Ventas), egresos y neto, día por día."""
    try:
        ventas = {row["fecha"]: row["combinado"] for row in sheets.get_ventas_diarias(SHEET_CONSOLIDADO_ID)}
        egresos = sheets.get_egresos_diarios(SHEET_CONSOLIDADO_ID)

        fechas = sheets.sort_fechas(set(ventas) | {row["fecha"] for row in egresos})
        egresos_por_fecha = {row["fecha"]: row for row in egresos}

        result = []
        for fecha in fechas:
            ingreso = ventas.get(fecha, 0.0)
            egreso_row = egresos_por_fecha.get(fecha, {"mdz": 0.0, "sj": 0.0, "total": 0.0})
            result.append(
                {
                    "fecha": fecha,
                    "ingresos": round(ingreso, 2),
                    "egresos": round(egreso_row["total"], 2),
                    "neto": round(ingreso - egreso_row["total"], 2),
                }
            )
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo calcular ingresos/egresos: {exc}") from exc


@router.get("/egresos-por-categoria")
def egresos_por_categoria(desde: str | None = None, hasta: str | None = None):
    """Sin parámetros, usa el mes calendario actual."""
    try:
        if desde and hasta:
            desde_dt = datetime.strptime(desde, "%Y-%m-%d")
            hasta_dt = datetime.strptime(hasta, "%Y-%m-%d")
        else:
            hoy = datetime.now()
            ultimo_dia = calendar.monthrange(hoy.year, hoy.month)[1]
            desde_dt = hoy.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            hasta_dt = hoy.replace(day=ultimo_dia, hour=23, minute=59, second=59, microsecond=0)
        return sheets.get_egresos_por_categoria(SHEET_CONSOLIDADO_ID, desde_dt, hasta_dt)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo agrupar egresos por categoría: {exc}") from exc
