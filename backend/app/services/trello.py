import requests

from app.config import TRELLO_API_KEY, TRELLO_BOARD_ID, TRELLO_TOKEN

BASE_URL = "https://api.trello.com/1"


def get_pedidos() -> list[dict]:
    auth = {"key": TRELLO_API_KEY, "token": TRELLO_TOKEN}

    lists_resp = requests.get(f"{BASE_URL}/boards/{TRELLO_BOARD_ID}/lists", params=auth, timeout=15)
    lists_resp.raise_for_status()
    lists_by_id = {lst["id"]: lst["name"] for lst in lists_resp.json()}

    cards_resp = requests.get(
        f"{BASE_URL}/boards/{TRELLO_BOARD_ID}/cards",
        params={**auth, "fields": "name,due,dateLastActivity,labels,idList"},
        timeout=15,
    )
    cards_resp.raise_for_status()

    return [
        {
            "id": card["id"],
            "nombre": card["name"],
            "lista": lists_by_id.get(card["idList"], ""),
            "vencimiento": card.get("due"),
            "ultima_actividad": card.get("dateLastActivity"),
            "etiquetas": [label["name"] for label in card.get("labels", [])],
        }
        for card in cards_resp.json()
    ]
