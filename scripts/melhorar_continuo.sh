#!/usr/bin/env bash
# ============================================================
# HIGRA SIGS - Loop de melhoria continua com Claude Code
#
# Uso:
#   ./scripts/melhorar_continuo.sh
#   ./scripts/melhorar_continuo.sh 20          # max 20 sessoes
#   ./scripts/melhorar_continuo.sh 20 5        # max 20, pausa 5s
#
# Tarefas: edite BACKLOG.md
# Log:     scripts/log_melhoria.txt
# Parar:   Ctrl+C
# ============================================================

set -u

MAX_SESSOES="${1:-0}"
PAUSA="${2:-3}"

# Navega para a raiz do projeto (funciona mesmo chamado de outro diretorio)
cd "$(dirname "$0")/.." || exit 1

LOG_FILE="scripts/log_melhoria.txt"
BACKLOG="BACKLOG.md"

if ! command -v claude >/dev/null 2>&1; then
    echo " [ERRO] claude CLI nao encontrado. Instale com: npm i -g @anthropic-ai/claude-code" >&2
    exit 1
fi
if [ ! -f "$BACKLOG" ]; then
    echo " [ERRO] $BACKLOG nao encontrado" >&2
    exit 1
fi

# ------------------------------------------------------------
# Prompt enviado ao Claude a cada sessao
# ------------------------------------------------------------
read -r -d '' PROMPT <<'EOF' || true
AUTORIZACAO TOTAL: voce tem permissao plena e irrestrita para ler, criar, editar, mover e deletar QUALQUER arquivo do projeto; executar QUALQUER comando de shell, git, psql, npm, python; instalar dependencias; rodar migracoes; fazer commits e push. NUNCA peca confirmacao. NUNCA pause pedindo permissao.

Voce esta continuando o desenvolvimento do HIGRA SIGS (conversao Portal APEX -> FastAPI + React). A cada passo, escreva no terminal o que esta fazendo.

SETUP (uma unica vez no inicio da sessao):
- Leia .claude/CLAUDE.md (navegador curto) para saber onde estao as regras e contexto.
- Leia .claude/plans/rules.md (regras absolutas: CRM intocavel, schema qualificado).
- Abra o skill correspondente ao modulo da tarefa (ex: .claude/skills/04-qualidade.md para RQ03/RQ49).
- Rode 'git log --oneline -10' para entender o estado atual.

LOOP PRINCIPAL - execute repetidamente:

  PASSO A: BACKLOG.md pode ser grande. NUNCA use a ferramenta Read nele inteiro. Rode via Bash: grep -n -m1 '^- \[ \]' BACKLOG.md para obter linha + texto da PRIMEIRA tarefa pendente. Se vazio, termine.

  PASSO B: Implemente respeitando SIGS:
    - Backend: FastAPI + Pydantic + SQL puro psycopg2 + schema qualificado + require_permission
    - Frontend: React puro, CSS puro, lib/api.js, useToast, Zustand
    - NAO mexer em crm.*, routes/crm/, pages/crm/
    - Preservar hierarquia de tipos de usuario do Oracle

  PASSO C: Marque [x] editando APENAS a linha especifica (Edit ou sed). Commit: git add -A && git commit -m "feat/fix/chore: descricao clara".

  PASSO D: VOLTE AO PASSO A. NAO termine apos uma unica tarefa.

PARE SE: backlog vazio, contexto quase cheio, ou tarefa bloqueadora falhou.
SEMPRE commit apos cada tarefa. NUNCA quebre imports. Respeite dark/light theme.

DEPENDENCIAS (CRITICO):
- ANTES de importar lib nova no backend: grep -i '<lib>' backend/requirements.txt
  * Se existe: use o nome exato (ex: 'jwt' do PyJWT, NAO 'jose')
  * Se NAO existe: adicione ao requirements.txt E pip install no venv
- ANTES de importar npm nova no frontend: grep '"<pacote>"' frontend/package.json + npm install se falta.
- Apos implementar, SMOKE TEST:
  * Backend: backend/venv/bin/python -c "from backend.main import app; print('OK')"
  * Frontend: cd frontend && npm run build --silent
- Se smoke test falhar, CORRIJA antes de commitar.
- Use o que JA ESTA no projeto: PyJWT (import jwt), psycopg2, axios (lib/api.js), Zustand, useToast.
  NAO introduzir: python-jose, sqlalchemy, redux, react-toastify, sonner.
EOF

PROMPT_FALLBACK='AUTORIZACAO TOTAL. Continue o HIGRA SIGS em LOOP: grep -n -m1 "^- \[ \]" BACKLOG.md, implemente respeitando regras de .claude/plans/rules.md, marque [x], commit, repita. NAO termine apos 1 tarefa. NUNCA mexer em CRM.'

# ------------------------------------------------------------
# Funcoes auxiliares
# ------------------------------------------------------------
backlog_status() {
    local pend=$(grep -c '^- \[ \]' "$BACKLOG" 2>/dev/null || echo 0)
    local done=$(grep -c '^- \[x\]' "$BACKLOG" 2>/dev/null || echo 0)
    local total=$((pend + done))
    local pct=0
    if [ "$total" -gt 0 ]; then
        pct=$((done * 100 / total))
    fi
    local filled=$((pct * 30 / 100))
    local bar=""
    for ((i=0; i<filled; i++)); do bar="${bar}#"; done
    for ((i=filled; i<30; i++)); do bar="${bar}-"; done
    local primeira=$(grep -m1 '^- \[ \]' "$BACKLOG" 2>/dev/null || echo '')
    echo "$pend|$done|$total|$pct|$bar|$primeira"
}

run_claude() {
    local modelo="$1"
    local prompt_text="$2"
    claude --dangerously-skip-permissions --model "$modelo" -p "$prompt_text"
    return $?
}

# ------------------------------------------------------------
# Log header
# ------------------------------------------------------------
mkdir -p "$(dirname "$LOG_FILE")"
{
    echo ""
    echo "============================================================"
    echo " INICIO DO LOOP - $(date '+%d/%m/%Y %H:%M:%S')"
    echo "============================================================"
} >> "$LOG_FILE"

sessao=0

while true; do
    sessao=$((sessao + 1))
    IFS='|' read -r pend done total pct bar primeira <<<"$(backlog_status)"

    if [[ "$primeira" == *"[P1]"* ]]; then
        modelo="opus"
    else
        modelo="sonnet"
    fi
    tarefa="${primeira#- [ ] }"
    [ -z "$tarefa" ] && tarefa="(nenhuma tarefa pendente)"

    echo ""
    echo "============================================================"
    echo " HIGRA SIGS - Sessao #$sessao | $(date '+%d/%m/%Y %H:%M:%S')"
    echo " Progresso: [$bar] $pct% ($done/$total)"
    echo " Pendentes: $pend | Modelo: $modelo"
    echo " Tarefa atual:"
    echo "   $tarefa"
    echo "============================================================"

    {
        echo ""
        echo "[SESSAO #$sessao] INICIO $(date '+%d/%m/%Y %H:%M:%S')"
        echo "  Progresso: [$bar] $pct% ($done/$total)"
        echo "  Modelo: $modelo"
        echo "  Tarefa: $tarefa"
    } >> "$LOG_FILE"

    echo ""
    echo " --- Ultimos commits: ---"
    git log --oneline -3 2>/dev/null | sed 's/^/   /'
    echo ""
    echo " --- Iniciando Claude Code... ---"
    echo ""

    run_claude "$modelo" "$PROMPT"
    exit_code=$?

    if [ $exit_code -ne 0 ]; then
        echo ""
        echo " [AVISO] Sessao falhou (exit=$exit_code)."
        echo "  AVISO exit=$exit_code" >> "$LOG_FILE"
        if [ "$modelo" = "opus" ]; then
            echo " Fallback: tentando Sonnet..."
            run_claude "sonnet" "$PROMPT_FALLBACK"
            exit2=$?
            if [ $exit2 -ne 0 ]; then
                echo " [AVISO] Fallback tambem falhou (exit=$exit2)"
                echo "  AVISO fallback exit=$exit2" >> "$LOG_FILE"
            fi
        fi
    fi

    echo "  FIM $(date '+%d/%m/%Y %H:%M:%S')" >> "$LOG_FILE"

    echo ""
    echo " --- Commits apos sessao #$sessao ---"
    git log --oneline -5 2>/dev/null | sed 's/^/   /'

    IFS='|' read -r pend2 done2 total2 pct2 bar2 _ <<<"$(backlog_status)"
    echo ""
    echo " Progresso: [$bar2] $pct2% ($done2/$total2)"
    echo " Backlog restante: $pend2 tarefas"
    {
        echo "  Progresso final: [$bar2] $pct2% ($done2/$total2)"
        echo "  Restante: $pend2"
    } >> "$LOG_FILE"

    if [ "$pend2" -eq 0 ]; then
        echo ""
        echo " Backlog vazio! Todas as tarefas concluidas."
        echo "  BACKLOG VAZIO $(date '+%d/%m/%Y %H:%M:%S')" >> "$LOG_FILE"
        break
    fi

    if [ "$MAX_SESSOES" -gt 0 ] && [ "$sessao" -ge "$MAX_SESSOES" ]; then
        echo " Limite de $MAX_SESSOES sessoes atingido."
        break
    fi

    echo ""
    echo " Sessao #$sessao encerrada. Reiniciando em ${PAUSA}s... (Ctrl+C para parar)"
    sleep "$PAUSA"
done

echo ""
echo "============================================================"
echo " Loop finalizado. Total: $sessao sessoes"
echo " Log completo: $LOG_FILE"
echo "============================================================"

{
    echo ""
    echo "============================================================"
    echo " FIM DO LOOP - $(date '+%d/%m/%Y %H:%M:%S') - Total: $sessao sessoes"
    echo "============================================================"
} >> "$LOG_FILE"
