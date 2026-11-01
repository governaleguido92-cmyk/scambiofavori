"""Moderazione dei testi: odio e discriminazione, violenza, contenuti sessuali, linguaggio offensivo.

Le frasi di questi test sono esempi per verificare il filtro, non contenuti dell'app.
"""
import pytest

import core
from conftest import auth, make_favor, make_user
from moderation import check_text, normalize

# (testo, categoria attesa)
BLOCKED = [
    # linguaggio offensivo
    ("Sei uno stronzo", "offensive"),
    ("che merda di servizio", "offensive"),
    ("vaffanculo", "offensive"),
    ("you are an asshole", "offensive"),
    ("fuck you", "offensive"),
    # discriminazione e odio
    ("odio gli immigrati", "discrimination"),
    ("Odio tutti i musulmani", "discrimination"),
    ("morte agli ebrei", "discrimination"),
    ("gli stranieri devono morire", "discrimination"),
    ("sporchi zingari", "discrimination"),
    ("maledetti stranieri", "discrimination"),
    ("tornatene al tuo paese", "discrimination"),
    ("sporco negro", "discrimination"),
    ("quel frocio di vicino", "discrimination"),
    ("heil hitler", "discrimination"),
    ("dirty muslims", "discrimination"),
    ("what a faggot", "discrimination"),
    # violenza e minacce
    ("ti ammazzo", "violence"),
    ("Ti uccido se non vieni", "violence"),
    ("ti spacco la faccia", "violence"),
    ("vi picchio tutti", "violence"),
    ("ti faccio fuori", "violence"),
    ("voglio uccidere lui", "violence"),
    ("I will kill you", "violence"),
    ("i'll stab you", "violence"),
    # istigazione all'autolesionismo
    ("ammazzati", "self_harm"),
    ("suicidati", "self_harm"),
    ("kill yourself", "self_harm"),
    # contenuti sessuali
    ("cerco qualcuno per sesso", "sexual"),
    ("vuoi scopare?", "sexual"),
    ("foto porno", "sexual"),
    ("escort disponibile", "sexual"),
    # attività illegali
    ("vendo droga", "illegal"),
    ("cocaina a buon prezzo", "illegal"),
]

# Testi normali che non devono mai essere bloccati (falsi positivi)
ALLOWED = [
    "Aiuto con la spesa al mercato",
    "Annaffiare le piante per una settimana",
    "Ammazzare il tempo con una partita a carte",
    "Uccidere le zanzare in casa",
    "Mi serve una scopa nuova per le pulizie",
    "Qual è lo scopo del favore?",
    "Finocchio e arance dal mercato",
    "Negroni da preparare per la festa",
    "Riparare una crepa nel muro",
    "Cucire le asole di una camicia",
    "Aiuto una persona disabile con la spesa",
    "Accompagno un amico musulmano in moschea",
    "Cerco un'amica ebrea per parlare di tradizioni",
    "Ripetizioni di inglese per bambini stranieri",
    "Le piante muoiono senza acqua",
    "Passaggio in auto fino a Marsala",
    "Persona di colore cerca aiuto con il computer",
    "Mi muoio di fame, qualcuno cucina?",
    "Help with a shopping trip",
    "I can cook dinner for a neighbour",
    "",
]


@pytest.mark.parametrize("text,category", BLOCKED)
def test_blocks_harmful_text(text, category):
    result = check_text(text)

    assert not result.allowed, text
    assert result.category == category, text
    assert result.reason


@pytest.mark.parametrize("text", ALLOWED)
def test_allows_normal_text(text):
    result = check_text(text)

    assert result.allowed, text
    assert result.category is None


@pytest.mark.parametrize(
    "text",
    [
        "STRONZO",                 # maiuscole
        "Stronzooo",               # lettere ripetute
        "str0nz0",                 # numeri al posto delle lettere
        "s t r o n z o",           # lettere separate
        "s.t.r.o.n.z.o",
        "ódio gli immigrati",      # accenti
        "ti   ammazzo",            # spazi doppi
        "TI AMM4ZZ0",              # misto
    ],
)
def test_resists_simple_evasions(text):
    assert not check_text(text).allowed, text


def test_none_and_whitespace_are_allowed():
    assert check_text(None).allowed
    assert check_text("   ").allowed


def test_normalize_is_lowercase_without_accents():
    assert normalize("PERCHÉ") == "perche"


# ---------- integrazione con le rotte ----------

async def test_favor_with_discriminatory_text_is_rejected(client, app_db):
    await app_db.users.insert_one(make_user("u1"))
    payload = {
        "type": "offer",
        "title": "Aiuto con la spesa",
        "description": "Aiuto tutti tranne gli stranieri, sporchi immigrati",
        "category": "Spesa",
        "duration_hours": 1,
        "latitude": 37.9,
        "longitude": 12.3,
    }

    response = await client.post("/api/favors", json=payload, headers=auth("u1"))

    assert response.status_code == 400
    assert "Contenuto non consentito" in response.json()["detail"]


async def test_favor_address_is_moderated_too(client, app_db):
    await app_db.users.insert_one(make_user("u1"))
    payload = {
        "type": "offer",
        "title": "Aiuto con la spesa",
        "description": "Porto la spesa a casa",
        "category": "Spesa",
        "duration_hours": 1,
        "latitude": 37.9,
        "longitude": 12.3,
        "address": "via vaffanculo 1",
    }

    response = await client.post("/api/favors", json=payload, headers=auth("u1"))

    assert response.status_code == 400


async def test_wall_post_with_threat_is_rejected(client, app_db):
    await app_db.users.insert_one(make_user("u1"))

    response = await client.post("/api/wall", json={"content": "ti ammazzo domani"}, headers=auth("u1"))

    assert response.status_code == 400
    assert await app_db.wall_posts.count_documents({}) == 0


async def test_wall_post_normal_text_is_accepted(client, app_db):
    await app_db.users.insert_one(make_user("u1"))

    response = await client.post("/api/wall", json={"content": "Grazie a tutti per la festa di quartiere"}, headers=auth("u1"))

    assert response.status_code == 200


async def test_review_comment_and_public_thanks_are_moderated(client, app_db):
    await app_db.users.insert_many([make_user("creator"), make_user("helper")])
    await app_db.favors.insert_one(make_favor())

    bad_comment = await client.post(
        "/api/reviews",
        json={"favor_id": "favor_1", "rating": 5, "comment": "che stronzo"},
        headers=auth("creator"),
    )
    bad_thanks = await client.post(
        "/api/reviews",
        json={"favor_id": "favor_1", "rating": 5, "public_thanks": "morte agli ebrei"},
        headers=auth("creator"),
    )

    assert bad_comment.status_code == 400
    assert bad_thanks.status_code == 400
    assert await app_db.reviews.count_documents({}) == 0
    assert await app_db.thanks.count_documents({}) == 0


async def test_object_name_and_description_are_moderated(client, app_db):
    await app_db.users.insert_one(make_user("u1"))

    response = await client.post(
        "/api/objects",
        json={"name": "Trapano", "description": "ti spacco la testa se lo rompi", "category": "Bricolage", "deposit_soli": 1},
        headers=auth("u1"),
    )

    assert response.status_code == 400


async def test_name_change_is_moderated(client, app_db):
    await app_db.users.insert_one(make_user("u1"))

    bad = await client.put("/api/user/name", json={"name": "Hitler Fan Sieg Heil"}, headers=auth("u1"))
    good = await client.put("/api/user/name", json={"name": "Marta Rossi"}, headers=auth("u1"))

    assert bad.status_code == 400
    assert good.status_code == 200


async def test_registration_with_offensive_name_is_rejected(client, app_db):
    response = await client.post(
        "/api/auth/register",
        json={"email": "new@example.com", "name": "Sporco Negro", "password": "longenough1"},
    )

    assert response.status_code == 400
    assert await app_db.users.count_documents({}) == 0


async def test_chat_message_with_hate_speech_is_blocked(client, app_db):
    await app_db.users.insert_many([make_user("creator"), make_user("helper")])
    await app_db.favors.insert_one(make_favor())

    response = await client.post(
        "/api/messages",
        json={"favor_id": "favor_1", "content": "gli stranieri devono morire"},
        headers=auth("creator"),
    )

    assert response.status_code == 400


async def test_chat_meeting_point_name_is_moderated(client, app_db):
    await app_db.users.insert_many([make_user("creator"), make_user("helper")])
    await app_db.favors.insert_one(make_favor())

    response = await client.post(
        "/api/messages",
        json={
            "favor_id": "favor_1",
            "content": "Ci vediamo qui",
            "message_type": "meeting_point",
            "meeting_point": {"name": "ti ammazzo davanti al bar", "latitude": 37.9, "longitude": 12.3},
        },
        headers=auth("creator"),
    )

    assert response.status_code == 400


async def test_chat_normal_message_still_goes_through(client, app_db):
    await app_db.users.insert_many([make_user("creator"), make_user("helper")])
    await app_db.favors.insert_one(make_favor())

    response = await client.post(
        "/api/messages",
        json={"favor_id": "favor_1", "content": "Grazie, ci vediamo domani alle 10"},
        headers=auth("creator"),
    )

    assert response.status_code == 200
