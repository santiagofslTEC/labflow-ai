"""The probe's prod write guard (spec 0007, AC-25)."""

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest

PROBE = Path(__file__).resolve().parents[1] / "scripts" / "voice_probe.py"


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location("voice_probe", PROBE)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize(
    ("sentence", "saves"),
    [
        ("Hola, ¿me escuchas?", False),
        ("deshacer", False),
        ("ensayo 3, temperatura 65 grados", True),
        ("Ensayo uno, sesenta y cinco", True),
        ("veintitrés grados", True),
        ("dieciséis", True),
    ],
)
def test_could_save_flags_sentences_with_numbers(sentence: str, saves: bool) -> None:
    assert _load().could_save(sentence) is saves
