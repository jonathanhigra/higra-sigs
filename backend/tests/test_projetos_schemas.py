import pytest
from pydantic import ValidationError

from backend.routes.projetos.schemas import (
    ProjetoAnotacaoCreate,
    ProjetoCreate,
    ProjetoGastoCreate,
    ProjetoParticipanteCreate,
    ProjetoUpdate,
)


def test_projeto_create_requires_title():
    with pytest.raises(ValidationError):
        ProjetoCreate(titulo=" ")


def test_projeto_update_accepts_blank_deadline_as_none():
    payload = ProjetoUpdate(dt_prev_termino="", objetivo="  Modernizar  ")

    assert payload.dt_prev_termino is None
    assert payload.objetivo == "Modernizar"


def test_projeto_participante_requires_positive_user_id():
    with pytest.raises(ValidationError):
        ProjetoParticipanteCreate(usuario_id=0)


def test_projeto_gasto_rejects_negative_value():
    with pytest.raises(ValidationError):
        ProjetoGastoCreate(descricao="Viagem", valor=-1)


def test_projeto_anotacao_requires_text():
    with pytest.raises(ValidationError):
        ProjetoAnotacaoCreate(descricao=" ")
