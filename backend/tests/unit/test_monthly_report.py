"""Rapporto mensile: solo numeri aggregati, niente nomi né testi dei messaggi."""
from datetime import date, datetime, timezone

import pytest

import monthly_report as mr
from conftest import make_favor, make_user


def at(day: int, hour: int = 12, month: int = 10) -> datetime:
    return datetime(2026, month, day, hour, 0, tzinfo=timezone.utc)


def test_month_bounds_use_the_italian_calendar():
    start, end = mr.month_bounds(2026, 10)
    # ottobre 2026: ora legale fino al 25/10, poi solare. Il 1/10 00:00 a Roma è il 30/9 alle 22:00 UTC
    assert start == datetime(2026, 9, 30, 22, 0, tzinfo=timezone.utc)
    assert end == datetime(2026, 10, 31, 23, 0, tzinfo=timezone.utc)


def test_previous_month_handles_january():
    assert mr.previous_month(date(2026, 1, 1)) == (2025, 12)
    assert mr.previous_month(date(2026, 11, 1)) == (2026, 10)


async def seed(db):
    await db.users.insert_many([
        make_user("u1", created_at=at(5)),
        make_user("u2", created_at=datetime(2026, 10, 31, 23, 30, tzinfo=timezone.utc)),  # già 1 novembre a Roma
        make_user("u3", created_at=at(30, month=9)),
        make_user("u4", created_at=at(8), phone_verified=True, phone_verified_at=at(9)),
        make_user("u5", created_at=at(9), safety_hold=True, safety_hold_at=at(20)),
    ])
    await db.favors.insert_many([
        make_favor("f1", creator_id="u1", creator_name="u1", accepted_by="u3", status="completed", category="Spesa",
                   duration_hours=2.0, granelli_cost=2, created_at=at(10), accepted_at=at(11), completed_at=at(12),
                   approximate_latitude=37.93, approximate_longitude=12.33),
        make_favor("f2", creator_id="u1", creator_name="u1", accepted_by="u4", status="cancelled", category="Spesa",
                   created_at=at(11), accepted_at=at(12), cancelled_at=at(15), cancelled_by="u1", cancelled_after_accept=True),
        make_favor("f3", creator_id="u3", creator_name="u3", accepted_by=None, status="active", category="Trasporto",
                   created_at=at(12)),
        make_favor("f4", creator_id="u3", creator_name="u3", status="completed", category="Spesa",
                   created_at=at(20, month=9), completed_at=at(2), duration_hours=5.0, granelli_cost=5),  # completato a ottobre
    ])
    await db.messages.insert_many([
        {"message_id": "m1", "sender_id": "u1", "blocked": False, "created_at": at(10)},
        {"message_id": "m2", "sender_id": "u3", "blocked": False, "created_at": at(10)},
        {"message_id": "m3", "sender_id": "u4", "blocked": True, "block_reason": "scam", "created_at": at(10)},
        {"message_id": "m4", "sender_id": "u4", "blocked": True, "block_reason": "money", "created_at": at(11)},
        {"message_id": "m5", "sender_id": "u1", "blocked": False, "created_at": at(5, month=9)},
    ])
    await db.general_reports.insert_many([
        {"report_id": "r1", "reason": "safety_alert", "created_at": at(14)},
        {"report_id": "r2", "reason": "spam", "created_at": at(15)},
        {"report_id": "r3", "reason": "safety_alert", "created_at": at(3, month=9)},
    ])
    await db.blocked_users.insert_many([
        {"block_id": "b1", "created_at": at(16)}, {"block_id": "b2", "created_at": at(17)}, {"block_id": "b3", "created_at": at(1, month=11)},
    ])
    await db.phone_requests.insert_many([{"user_id": "u4", "created_at": at(9)}, {"user_id": "u4", "created_at": at(9, 13)}])
    await db.account_deletions.insert_one({"deleted_at": at(18)})


async def test_users_section(app_db):
    await seed(app_db)
    report = await mr.compute_month(app_db, 2026, 10)

    assert report["period"] == "2026-10"
    assert report["utenti"]["nuovi_iscritti"] == 3  # u1, u4, u5 (u2 è di novembre a Roma, u3 di settembre)
    assert report["utenti"]["eliminati"] == 1
    assert report["utenti"]["attivi"] == 3  # u1, u3, u4: chi ha creato, accettato o scritto nel mese
    assert report["utenti"]["telefoni_verificati"] == 1


async def test_favors_section(app_db):
    await seed(app_db)
    favors = (await mr.compute_month(app_db, 2026, 10))["favori"]

    assert favors["pubblicati"] == 3  # f1, f2, f3 (f4 è di settembre)
    assert favors["accettati"] == 2  # f1, f2
    assert favors["completati"] == 2  # f1 e f4 (completato a ottobre)
    assert favors["annullati_dopo_accettazione"] == 1
    assert favors["ore_scambiate"] == 7.0
    assert favors["granelli_scambiati"] == 7
    assert favors["categorie"][0] == {"nome": "Spesa", "favori": 2}


async def test_safety_section(app_db):
    await seed(app_db)
    report = await mr.compute_month(app_db, 2026, 10)

    assert report["messaggi"]["inviati"] == 2  # consegnati: m1 e m2 (m3 e m4 bloccati, m5 di settembre)
    assert report["messaggi"]["bloccati"] == {"scam": 1, "money": 1}
    assert report["sicurezza"]["segnalazioni"] == 2
    assert report["sicurezza"]["allarmi_sicurezza"] == 1
    assert report["sicurezza"]["blocchi_utenti"] == 2
    assert report["sicurezza"]["account_in_revisione"] == 1


async def test_sms_section_has_cost_only_when_price_is_known(app_db, monkeypatch):
    await seed(app_db)
    monkeypatch.delenv("SMS_COST_EUR", raising=False)
    assert (await mr.compute_month(app_db, 2026, 10))["sms"] == {"inviati": 2, "costo_stimato_eur": None}

    monkeypatch.setenv("SMS_COST_EUR", "0.10")
    assert (await mr.compute_month(app_db, 2026, 10))["sms"]["costo_stimato_eur"] == 0.2


async def test_report_has_no_names_or_message_text(app_db):
    await seed(app_db)
    report = await mr.compute_month(app_db, 2026, 10)
    dumped = str(report)
    for forbidden in ("u1@example.com", "Aiuto spesa", "creator_name"):
        assert forbidden not in dumped


async def test_zones_are_coarse_grid_cells(app_db):
    await seed(app_db)
    zones = (await mr.compute_month(app_db, 2026, 10))["favori"]["zone"]
    assert zones == [{"zona": "37.9, 12.3", "favori": 1}]


async def test_empty_month_gives_zeros_not_errors(app_db):
    report = await mr.compute_month(app_db, 2026, 10)
    assert report["utenti"]["nuovi_iscritti"] == 0
    assert report["favori"]["categorie"] == []
    assert report["sicurezza"]["segnalazioni"] == 0


def test_email_has_a_clear_table():
    report = {
        "period": "2026-10", "label": "ottobre 2026",
        "utenti": {"nuovi_iscritti": 3, "attivi": 4, "eliminati": 1, "telefoni_verificati": 1},
        "favori": {"pubblicati": 3, "accettati": 2, "completati": 2, "annullati_dopo_accettazione": 1,
                   "ore_scambiate": 7.0, "granelli_scambiati": 7, "categorie": [{"nome": "Spesa", "favori": 2}], "zone": []},
        "messaggi": {"inviati": 4, "bloccati": {"scam": 1}},
        "sicurezza": {"segnalazioni": 2, "allarmi_sicurezza": 1, "blocchi_utenti": 2, "account_in_revisione": 1},
        "sms": {"inviati": 2, "costo_stimato_eur": None},
    }
    subject, html, text = mr.render_report(report)

    assert "ottobre 2026" in subject
    assert "<table" in html and "Nuovi iscritti" in html and "Spesa" in html
    assert "Nuovi iscritti: 3" in text
    assert "n.d." in text  # costo SMS sconosciuto
