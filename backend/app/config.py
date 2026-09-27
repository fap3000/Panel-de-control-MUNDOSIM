import os

from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv(".env")

# En local: ruta a un archivo JSON. En producción (Render) no hay forma cómoda
# de "subir" un archivo, así que ahí se usa GOOGLE_SERVICE_ACCOUNT_JSON con el
# contenido completo del JSON pegado como variable de entorno.
GOOGLE_SERVICE_ACCOUNT_FILE = os.environ.get("GOOGLE_SERVICE_ACCOUNT_FILE", "service_account.json")
GOOGLE_SERVICE_ACCOUNT_JSON = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "")

TRELLO_API_KEY = os.environ.get("TRELLO_API_KEY", "")
TRELLO_TOKEN = os.environ.get("TRELLO_TOKEN", "")
TRELLO_BOARD_ID = os.environ.get("TRELLO_BOARD_ID", "13mAq7FN")

SHEET_CONSOLIDADO_ID = os.environ.get("SHEET_CONSOLIDADO_ID", "1OnR7GPTcbMyX_9QlZBGf88PXCbJAx9a1R3hHsWvyaYQ")
SHEET_PAGOS_PROVEEDORES_ID = os.environ.get("SHEET_PAGOS_PROVEEDORES_ID", "1DfNY3u0UAjsDTqVSQQb61rgBfRMGKQIH")

# Listas de precios/stock por sucursal — hojas 'Lista Faltantes' y 'Faltantes Recuperados'
SHEET_FALTANTES_MDZ_ID = os.environ.get("SHEET_FALTANTES_MDZ_ID", "1v-G55wdeRUASG0KNI2Z9SzCy3Kg8RfO37pzeqSWmm5Q")
SHEET_FALTANTES_SJ_ID = os.environ.get("SHEET_FALTANTES_SJ_ID", "17dDpvHVurcLGjOMZY0JpN8Sv1W1kADCxGCa8eqlAM6I")

# Cierre de caja diario por sucursal — hoja 'CAJA' (se resetea todos los días)
SHEET_CAJA_MDZ_ID = os.environ.get("SHEET_CAJA_MDZ_ID", "1_2fplAHvUnXr61dbbcM4X1HNDwEPclg0EbMKnNj17kQ")
SHEET_CAJA_SJ_ID = os.environ.get("SHEET_CAJA_SJ_ID", "1-0a3Z20xC3UP7J0R7xY2DwzKttF5A0njTZ-q3PriflI")

# Token compartido para el endpoint de captura diaria (POST /captura/cierre-caja),
# que dispara un cron externo — sin esto, cualquiera con la URL podría gatillarlo.
CAPTURA_TOKEN = os.environ.get("CAPTURA_TOKEN", "")

# Uno o más orígenes separados por coma (ej. "https://tablero.vercel.app,http://localhost:5173")
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
