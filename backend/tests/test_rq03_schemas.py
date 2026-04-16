import pytest
from pydantic import ValidationError

from backend.routes.qualidade.rq03_schemas import (
    Rq03AnotacaoCreate,
    Rq03Create,
    Rq03ParticipanteCreate,
    Rq03SstUpdate,
    Rq03Update,
)


def test_rq03_create_requires_description():
    with pytest.raises(ValidationError):
        Rq03Create(descricao=" ")


def test_rq03_update_accepts_blank_fields_as_none():
    payload = Rq03Update(reclamante="  Cliente X  ", tipo="", beg_processo_id=None)

    assert payload.reclamante == "Cliente X"
    assert payload.tipo is None


def test_rq03_participante_requires_positive_user_id():
    with pytest.raises(ValidationError):
        Rq03ParticipanteCreate(usuario_id=0)


def test_rq03_sst_rejects_negative_leave_days():
    with pytest.raises(ValidationError):
        Rq03SstUpdate(dias_afastamento=-1)


def test_rq03_anotacao_requires_text():
    with pytest.raises(ValidationError):
        Rq03AnotacaoCreate(descricao=" ")
