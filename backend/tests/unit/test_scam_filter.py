"""Filtro anti-truffa in chat: richieste di codici, anticipi, ricariche, carte e IBAN vengono bloccate."""
import pytest

from conftest import auth, make_favor, make_user
from core import contains_money_reference, contains_scam_hint

SCAM_TEXTS = [
    "Mandami il codice che ti arriva per sms",
    "mi dai il codice di verifica che hai ricevuto?",
    "Faccio una ricarica sulla mia carta, ti passo il numero",
    "Serve un anticipo per iniziare",
    "Puoi mandarmi una ricarica postepay?",
    "Pago con Western Union",
    "Compra una gift card e dimmi il codice",
    "Ti pago in bitcoin",
    "IT60 X054 2811 1010 0000 0123 456",
    "IT60X0542811101000000123456",
    "il numero è 4111 1111 1111 1111",
    "mandami la password",
    "dammi il pin",
]

SAFE_TEXTS = [
    "Ci vediamo domani alle 17 in piazza",
    "Porto io la spesa, tu hai le chiavi?",
    "Ho 3 buste pesanti, arrivo tra 10 minuti",
    "Il codice della porta lo sai già",
    "Grazie mille, è stato un piacere",
]


@pytest.mark.parametrize("text", SCAM_TEXTS)
def test_scam_texts_are_flagged(text):
    assert contains_scam_hint(text) or contains_money_reference(text)


@pytest.mark.parametrize("text", SAFE_TEXTS)
def test_normal_texts_are_not_flagged(text):
    assert not contains_scam_hint(text)
    assert not contains_money_reference(text)


async def test_scam_message_is_refused_and_not_saved(client, app_db):
    await app_db.users.insert_many([make_user("creator"), make_user("helper")])
    await app_db.favors.insert_one(make_favor())

    response = await client.post(
        "/api/messages",
        json={"favor_id": "favor_1", "content": "Mandami il codice che ti arriva per sms"},
        headers=auth("helper"),
    )

    assert response.status_code == 400
    assert "truffa" in response.json()["detail"].lower() or "codice" in response.json()["detail"].lower()
    stored = await app_db.messages.find({"blocked": False}).to_list(10)
    assert stored == []
