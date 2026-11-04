"""Controlli sui testi che gli utenti scrivono in uno spazio pubblico (messaggi e avvisi del quartiere)."""
from fastapi import HTTPException

from core import (contains_money_reference, contains_off_app_contact, contains_offensive_language, contains_personal_data,
                  contains_scam_hint, is_suspicious_link)


def ensure_public_text_allowed(content: str, max_length: int) -> None:
    """Solleva HTTPException 400 se il testo è vuoto, troppo lungo o contiene denaro, truffe, offese, link, inviti fuori dall'app o dati personali."""
    if not content:
        raise HTTPException(status_code=400, detail="Messaggio vuoto")
    if len(content) > max_length:
        raise HTTPException(status_code=400, detail=f"Il testo può avere al massimo {max_length} caratteri")
    if contains_money_reference(content):
        raise HTTPException(status_code=400, detail="Non sono ammessi riferimenti a denaro reale. Usa solo i Granelli!")
    if contains_scam_hint(content):
        raise HTTPException(
            status_code=400,
            detail="Messaggio bloccato: possibile truffa. Non chiedere né mandare codici, password, anticipi o dati di carte.",
        )
    if contains_offensive_language(content):
        raise HTTPException(status_code=400, detail="Linguaggio inappropriato non ammesso")
    if is_suspicious_link(content):
        raise HTTPException(status_code=400, detail="Link esterni non ammessi nel quartiere")
    if contains_off_app_contact(content):
        raise HTTPException(
            status_code=400,
            detail="Nel quartiere non invitare a continuare su WhatsApp, Telegram o \"in privato\": "
                   "ci si accorda nella chat del favore.",
        )
    if contains_personal_data(content)["has_personal_data"]:
        raise HTTPException(status_code=400, detail="Nel quartiere non condividere telefono o email: usa la chat del favore.")
