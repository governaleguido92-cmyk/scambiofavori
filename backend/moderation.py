"""Moderazione dei testi liberi: odio e discriminazione, violenza, contenuti sessuali, linguaggio offensivo.

Il filtro è una prima barriera automatica, non sostituisce segnalazioni e blocchi degli utenti. Lavora su un testo
normalizzato (minuscolo, senza accenti, numeri simili a lettere letti come lettere) e riconosce anche lettere
ripetute ("stronzooo") e separate ("s t r o n z o"). Non riconosce ogni travestimento (per esempio asterischi
dentro la parola) né il contesto: per questo le frasi più ambigue sono volutamente escluse, per non bloccare
richieste normali.
"""
import re
import unicodedata
from dataclasses import dataclass
from typing import Optional, Pattern

# Messaggi per l'utente: dicono perché il testo è stato fermato senza ripetere le parole.
REASONS = {
    "violence": "Il testo contiene minacce o riferimenti a violenza",
    "discrimination": "Il testo contiene contenuti discriminatori o di odio",
    "self_harm": "Il testo incita all'autolesionismo",
    "sexual": "Il testo contiene contenuti sessuali non adatti alla community",
    "illegal": "Il testo fa riferimento ad attività non consentite",
    "offensive": "Il testo contiene linguaggio offensivo",
}

# Ordine di controllo: la categoria più grave vince.
CATEGORY_ORDER = ("violence", "discrimination", "self_harm", "sexual", "illegal", "offensive")


@dataclass(frozen=True)
class ModerationResult:
    allowed: bool
    category: Optional[str] = None
    reason: Optional[str] = None


_ALLOWED = ModerationResult(allowed=True)

_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "€": "e"})
# Sequenze di singole lettere separate da spazi o punteggiatura: "s t r o n z o", "s.t.r.o.n.z.o"
_SPACED_LETTERS = re.compile(r"(?<![a-z])(?:[a-z][\s.\-_*]+){3,}[a-z](?![a-z])")
_NOT_LETTER_BEFORE = r"(?<![a-z])"
_NOT_LETTER_AFTER = r"(?![a-z])"


def normalize(text: str) -> str:
    """Minuscolo, senza accenti, con numeri e simboli simili a lettere sostituiti dalle lettere."""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    without_accents = "".join(char for char in decomposed if not unicodedata.combining(char))
    return without_accents.translate(_LEET)


def _word(word: str) -> str:
    """Parola intera in cui ogni lettera può ripetersi ("stronzo" riconosce anche "stronzooo")."""
    return "".join(re.escape(char) + "+" for char in word)


def _phrase(phrase: str) -> str:
    """Più parole separate da spazi, ognuna con lettere ripetibili."""
    return r"\s+".join(_word(part) for part in phrase.split())


def _compile(alternatives: list[str]) -> Pattern[str]:
    return re.compile(_NOT_LETTER_BEFORE + "(?:" + "|".join(alternatives) + ")" + _NOT_LETTER_AFTER)


def _words(*words: str) -> list[str]:
    return [_word(word) for word in words]


def _phrases(*phrases: str) -> list[str]:
    return [_phrase(phrase) for phrase in phrases]


# Gruppi di persone: si bloccano frasi di odio rivolte a loro, non le parole da sole.
_GROUPS_CORE = (
    r"(?:ebre[oiae]|giude[oi]|musulman[oiae]|islamic[oi]|arab[oi]|negr[oiae]|immigrat[oiae]|extracomunitar[ie]|"
    r"stranier[oie]|african[oi]|cines[ie]|rumen[oi]|albanes[ie]|marocchin[oi]|rom|zingar[oie]|gay|omosessual[ie]|"
    r"lesbic[ahe]+|trans|disabil[ie]|handicappat[oie]|mongol[oie])"
)
# "neri" da solo è anche un colore ("sporco golf nero"): lo si considera un gruppo solo dopo "odio", "morte a" ecc.
_GROUPS = r"(?:" + _GROUPS_CORE + r"|ner[oi])"
_DEROGATORY = r"(?:sporc[oa]|sporch[ie]|schifos[oiae]|lurid[oiae]|maledett[oiae]|parassit[ai])"
_ARTICLES = r"(?:i|gli|le|l'|ai|agli|alle|all')?\s*"

_HATE_PATTERNS = [
    # "odio gli immigrati", "odiamo tutti i musulmani"
    re.compile(_NOT_LETTER_BEFORE + r"odi(?:o|amo)\s+(?:tutt[oiae]\s+)?" + _ARTICLES + _GROUPS + _NOT_LETTER_AFTER),
    # "morte agli ebrei"
    re.compile(_NOT_LETTER_BEFORE + r"morte\s+(?:a|ai|agli|alle|all')\s*(?:tutt[oiae]\s+)?" + _ARTICLES + _GROUPS + _NOT_LETTER_AFTER),
    # "gli stranieri devono morire"
    re.compile(
        _NOT_LETTER_BEFORE + _GROUPS + r"\s+(?:di\s+merda\s+)?(?:devono|dovrebbero|vanno|andrebbero|meritano\s+di)\s+"
        r"(?:morire|essere\s+(?:uccis[oiae]|sterminat[oiae]|ammazzat[oiae])|bruciare|sparire|crepare)" + _NOT_LETTER_AFTER
    ),
    # "sporchi immigrati", "maledetti stranieri"
    re.compile(_NOT_LETTER_BEFORE + _DEROGATORY + r"\s+(?:[a-z]+\s+)?" + _GROUPS_CORE + _NOT_LETTER_AFTER),
    # "immigrati di merda"
    re.compile(_NOT_LETTER_BEFORE + _GROUPS + r"\s+di\s+merda" + _NOT_LETTER_AFTER),
    # "tornatene al tuo paese"
    re.compile(
        _NOT_LETTER_BEFORE + r"torna(?:te|tene|tevene)\s+(?:a\s+casa\s+(?:tua|vostra)|al\s+(?:tuo|vostro)\s+paese|da\s+dove\s+siete\s+venut[oi])"
        + _NOT_LETTER_AFTER
    ),
    # English: "dirty muslims", "filthy jews"
    re.compile(
        _NOT_LETTER_BEFORE + r"(?:dirty|filthy|stupid|disgusting)\s+(?:jews?|muslims?|arabs?|blacks?|immigrants?|gays?|faggots?)"
        + _NOT_LETTER_AFTER
    ),
]

_DISCRIMINATION = _compile(
    _words(
        # "negro"/"negri" da soli non si bloccano: sono anche cognomi italiani (si bloccano in frasi di odio)
        "negraccio", "negracci",
        "frocio", "froci", "frocia", "ricchione", "ricchioni", "culattone", "culattoni", "lesbicona",
        "mongoloide", "mongoloidi", "storpio", "storpi", "spastico", "spastica",
        "terrone", "terroni", "polentone", "polentoni", "zingaraccio", "zingaracci",
        "nigger", "niggers", "nigga", "niggas", "faggot", "faggots", "fag", "kike", "kikes", "chink", "chinks", "spic", "tranny",
        "retard", "retarded",
    )
    + _phrases("heil hitler", "sieg heil", "viva hitler", "viva il duce", "white power")
)

_VIOLENCE_VERBS = (
    r"(?:ammazzo|ammazzero|uccido|uccidero|spacco|spaccero|picchio|picchiero|pesto|massacro|massacrero|strangolo|strangolero|"
    r"sparo|sparero|accoltello|sgozzo|brucio|brucero|stupro|violento|violentero|distruggo|distruggero|meno|riempio\s+di\s+botte)"
)
_VIOLENCE = [
    # minacce rivolte a una persona: "ti ammazzo", "vi picchio"
    re.compile(_NOT_LETTER_BEFORE + r"(?:ti|vi)\s+" + _VIOLENCE_VERBS + _NOT_LETTER_AFTER),
    re.compile(
        _NOT_LETTER_BEFORE + r"(?:ti|vi)\s+(?:faccio|faro|fare)\s+(?:fuori|la\s+pelle|a\s+pezzi|saltare\s+i\s+denti)" + _NOT_LETTER_AFTER
    ),
    re.compile(
        _NOT_LETTER_BEFORE + r"(?:ti|vi)\s+(?:taglio\s+la\s+gola|butto\s+di\s+sotto|rompo\s+(?:le\s+gambe|le\s+ossa|la\s+faccia|il\s+muso|la\s+testa))"
        + _NOT_LETTER_AFTER
    ),
    # intenzioni: "voglio uccidere lui", "vado a picchiare tutti"
    re.compile(
        _NOT_LETTER_BEFORE
        + r"(?:voglio|vorrei|devo|dovrei|vado\s+a|andro\s+a|ho\s+voglia\s+di)\s+"
        r"(?:ammazzare|uccidere|picchiare|violentare|stuprare|strangolare|accoltellare|sparare\s+a)\s+"
        r"(?:te|voi|lui|lei|loro|tutti|qualcuno|chiunque)" + _NOT_LETTER_AFTER
    ),
    re.compile(_NOT_LETTER_BEFORE + r"(?:faro|farei|fare|facciamo)\s+una\s+strage" + _NOT_LETTER_AFTER),
    # English
    re.compile(
        _NOT_LETTER_BEFORE
        + r"(?:i(?:'ll|\s+will|'m\s+going\s+to|\s+am\s+going\s+to)\s+|(?:going\s+to\s+))?"
        r"(?:kill|hurt|rape|stab|shoot|beat\s+up)\s+(?:you|u|him|her|them|everyone)" + _NOT_LETTER_AFTER
    ),
]

_SELF_HARM = _compile(
    _words("ammazzati", "ammazzatevi", "uccidetevi", "suicidati", "suicidatevi", "impiccati", "impiccatevi", "sparati", "muori", "kys")
    + _phrases("vai a morire", "vai a crepare", "kill yourself", "kill urself", "go die")
)

_SEXUAL = _compile(
    _words(
        "sesso", "scopare", "scopata", "scopate", "scoparti", "trombare", "trombata", "pompino", "pompini",
        "porno", "pornografia", "pornografico", "pornostar", "escort", "prostituta", "prostitute", "prostituzione",
        "erotico", "erotica", "erotici", "tette", "tettona", "sex", "porn", "nudes",
    )
)

_ILLEGAL = _compile(
    _words("cocaina", "eroina", "hashish", "sicario")
    + [_phrase(verb) + r"\s+(?:della\s+|di\s+)?" + "(?:" + "|".join(_words("droga", "armi", "munizioni", "fucile", "fucili")) + ")"
       for verb in ("vendo", "compro", "cerco", "offro")]
)

_OFFENSIVE = _compile(
    _words(
        "stronzo", "stronza", "stronzi", "stronze", "coglione", "coglioni", "vaffanculo", "fanculo", "minchia",
        "cazzo", "cazzi", "fottiti", "fottetevi", "puttana", "puttane", "troia", "troie", "bastardo", "bastarda", "bastardi",
        "idiota", "idioti", "imbecille", "imbecilli", "deficiente", "deficienti", "scemo", "scema", "merda", "merde", "culo",
        "porcodio", "fuck", "fucking", "fucker", "motherfucker", "shit", "shitty", "bitch", "asshole", "cunt", "dickhead", "wanker",
    )
    + _phrases("porco dio", "dio cane", "dio porco")
)

_CATEGORY_PATTERNS: dict[str, list[Pattern[str]]] = {
    "violence": _VIOLENCE,
    "discrimination": [_DISCRIMINATION, *_HATE_PATTERNS],
    "self_harm": [_SELF_HARM],
    "sexual": [_SEXUAL],
    "illegal": [_ILLEGAL],
    "offensive": [_OFFENSIVE],
}


def _variants(text: str) -> list[str]:
    """Il testo normalizzato e la versione con le lettere separate riunite ("s t r o n z o" -> "stronzo")."""
    normalized = normalize(text)
    joined = _SPACED_LETTERS.sub(lambda match: re.sub(r"[^a-z]", "", match.group(0)), normalized)
    return [normalized] if joined == normalized else [normalized, joined]


def check_text(text: Optional[str]) -> ModerationResult:
    """Controlla un testo libero. `allowed` è False se contiene odio, minacce, contenuti sessuali o insulti."""
    if not text or not text.strip():
        return _ALLOWED
    variants = _variants(text)
    for category in CATEGORY_ORDER:
        for pattern in _CATEGORY_PATTERNS[category]:
            if any(pattern.search(variant) for variant in variants):
                return ModerationResult(allowed=False, category=category, reason=REASONS[category])
    return _ALLOWED
