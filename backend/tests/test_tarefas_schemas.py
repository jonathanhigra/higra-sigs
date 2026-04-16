import pytest
from pydantic import ValidationError

from backend.routes.tarefas.schemas import (
    TarefaApontamentoCreate,
    TarefaCreate,
    TarefaKanbanMove,
    TarefaUpdate,
)


def test_tarefa_create_requires_title():
    with pytest.raises(ValidationError):
        TarefaCreate(titulo="   ")


def test_tarefa_update_accepts_blank_dates_as_none():
    payload = TarefaUpdate(dt_inicio="", dt_previsao="", feedback="  ok  ")

    assert payload.dt_inicio is None
    assert payload.dt_previsao is None
    assert payload.feedback == "ok"


def test_tarefa_apontamento_requires_positive_minutes():
    with pytest.raises(ValidationError):
        TarefaApontamentoCreate(tempo_minutos=0)


def test_tarefa_kanban_move_requires_target_column():
    with pytest.raises(ValidationError):
        TarefaKanbanMove(hgr_tar_cad_etp_kbn_id=0)
