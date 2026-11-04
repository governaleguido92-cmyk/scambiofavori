"""Età all'iscrizione: la data di nascita serve solo a verificare che l'utente sia maggiorenne."""
from datetime import date

MIN_AGE = 18
MAX_AGE = 120


def parse_birth_date(text: str) -> date:
    """Legge una data nel formato AAAA-MM-GG. Solleva ValueError se non è una data possibile."""
    try:
        return date.fromisoformat(text.strip())
    except (ValueError, AttributeError) as error:
        raise ValueError("Data di nascita non valida") from error


def age_on(birth: date, today: date) -> int:
    """Anni compiuti alla data indicata."""
    years = today.year - birth.year
    if (today.month, today.day) < (birth.month, birth.day):
        years -= 1
    return years


def check_adult(birth_date_text: str, today: date | None = None) -> int:
    """Restituisce l'anno di nascita se la persona è maggiorenne; altrimenti solleva ValueError con il motivo."""
    today = today or date.today()
    birth = parse_birth_date(birth_date_text)
    age = age_on(birth, today)
    if birth > today or age > MAX_AGE:
        raise ValueError("Data di nascita non valida")
    if age < MIN_AGE:
        raise ValueError(f"Devi avere almeno {MIN_AGE} anni per iscriverti")
    return birth.year
