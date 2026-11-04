"""L'accesso può arrivare dall'intestazione Authorization o dal cookie: un cookie vecchio non deve oscurare un accesso valido."""
from conftest import auth, make_user
import core


async def test_invalid_cookie_does_not_hide_a_valid_bearer_token(client, app_db):
    await app_db.users.insert_one(make_user("me"))

    response = await client.get("/api/auth/me", headers=auth("me"), cookies={"session_token": "cookie-vecchio-non-valido"})

    assert response.status_code == 200
    assert response.json()["user_id"] == "me"


async def test_valid_cookie_alone_still_works(client, app_db):
    await app_db.users.insert_one(make_user("me"))

    response = await client.get("/api/auth/me", cookies={"session_token": core.create_jwt_token("me")})

    assert response.status_code == 200


async def test_nothing_or_only_garbage_is_refused(client, app_db):
    assert (await client.get("/api/auth/me")).status_code == 401
    garbage = await client.get("/api/auth/me", headers={"Authorization": "Bearer abc"}, cookies={"session_token": "def"})
    assert garbage.status_code == 401
    assert garbage.json()["detail"] == "Sessione non valida"
