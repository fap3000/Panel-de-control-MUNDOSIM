from fastapi import APIRouter, HTTPException

from app.config import SHEET_CONSOLIDADO_ID, SHEET_PAGOS_PROVEEDORES_ID
from app.services import sheets, trello

router = APIRouter(prefix="/compras", tags=["compras"])


@router.get("/resumen-proveedores")
def resumen_proveedores():
    try:
        return sheets.get_resumen_proveedores(SHEET_PAGOS_PROVEEDORES_ID)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo leer la hoja RESUMEN: {exc}") from exc


@router.get("/compras-diarias")
def compras_diarias():
    try:
        return sheets.get_registro_diario(SHEET_CONSOLIDADO_ID)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo leer Registro Diario U$: {exc}") from exc


@router.get("/pedidos-trello")
def pedidos_trello():
    try:
        return trello.get_pedidos()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo leer el board de Trello: {exc}") from exc


@router.get("/estimacion-pago-proveedores")
def estimacion_pago_proveedores():
    try:
        return sheets.get_estimacion_pago_proveedores(SHEET_PAGOS_PROVEEDORES_ID)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo estimar días para saldar: {exc}") from exc
