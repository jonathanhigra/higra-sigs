import pytest
from pydantic import ValidationError

from backend.routes.fabricacao.checklist_schemas import (
    ChecklistCreate,
    ChecklistOcorrenciaCreate,
    ChecklistUpdate,
    InstrumentoCreate,
)


def test_checklist_create_requires_pv():
    with pytest.raises(ValidationError):
        ChecklistCreate(pv=" ")


def test_checklist_update_rejects_invalid_status():
    with pytest.raises(ValidationError):
        ChecklistUpdate(status="finalizado")


def test_ocorrencia_requires_description():
    with pytest.raises(ValidationError):
        ChecklistOcorrenciaCreate(descricao=" ")


def test_instrumento_accepts_blank_dates_as_none():
    payload = InstrumentoCreate(descricao="Paquimetro", dt_calibracao="", dt_prox_calibracao="")

    assert payload.dt_calibracao is None
    assert payload.dt_prox_calibracao is None
