"""Il numero di Granelli si scrive sempre con la parola giusta: «1 Granello», «2 Granelli»."""
import core


def test_one_granello_is_singular():
    assert core.granelli_text(1) == "1 Granello"


def test_more_granelli_are_plural():
    assert core.granelli_text(2) == "2 Granelli"
    assert core.granelli_text(0) == "0 Granelli"
