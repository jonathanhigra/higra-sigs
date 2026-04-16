# ============================================================
# HIGRA SIGS - Loop de melhoria continua com Claude Code
# Orquestrador em PowerShell (robusto em Windows, sem pipes cmd)
#
# Uso:
#   .\scripts\melhorar_continuo.ps1
#   .\scripts\melhorar_continuo.ps1 -MaxSessoes 5
#   .\scripts\melhorar_continuo.ps1 -Pausa 30
#
# Tarefas: edite BACKLOG.md
# Log: scripts\log_melhoria.txt
# Para parar: Ctrl+C
# ============================================================

param(
    [int]$MaxSessoes = 0,
    [int]$Pausa = 3
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location 'C:\Users\user\Projetos\higra-sigs'

$LogFile  = 'scripts\log_melhoria.txt'
$Backlog  = 'BACKLOG.md'

# ------------------------------------------------------------
# Localizar node.exe + cli.js do Claude Code
# (Evita o wrapper claude.cmd, que tem um truque 'title %COMSPEC% & ...'
#  que falha em contextos nao-interativos/piped no Windows.)
# ------------------------------------------------------------
$nodeExe = $null
$whereNode = (& cmd /c where node 2>$null)
if ($whereNode) {
    $nodeExe = (@($whereNode) | Where-Object { $_ -like '*.exe' } | Select-Object -First 1)
    if (-not $nodeExe) { $nodeExe = (@($whereNode) | Select-Object -First 1) }
}
if (-not $nodeExe -or -not (Test-Path $nodeExe)) {
    Write-Host ' [ERRO] node nao encontrado. Instale Node.js.' -ForegroundColor Red
    exit 1
}

# Candidatos para cli.js (npm global em %APPDATA% ou instalacao local)
$cliCandidates = @(
    (Join-Path $env:APPDATA 'npm\node_modules\@anthropic-ai\claude-code\cli.js'),
    (Join-Path $env:USERPROFILE '.local\lib\node_modules\@anthropic-ai\claude-code\cli.js'),
    (Join-Path $env:ProgramFiles 'nodejs\node_modules\@anthropic-ai\claude-code\cli.js')
)
$claudeCli = $cliCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $claudeCli) {
    Write-Host ' [ERRO] cli.js do claude nao encontrado. Instale com: npm i -g @anthropic-ai/claude-code' -ForegroundColor Red
    exit 1
}
Write-Host " [debug] Node:   $nodeExe" -ForegroundColor DarkGray
Write-Host " [debug] Claude: $claudeCli" -ForegroundColor DarkGray
Write-Host " [debug] Backlog: $Backlog" -ForegroundColor DarkGray

# ------------------------------------------------------------
# Prompt enviado ao Claude a cada sessao
# ------------------------------------------------------------
$prompt = @'
AUTORIZACAO TOTAL: voce tem permissao plena e irrestrita para ler, criar, editar, mover e deletar QUALQUER arquivo do projeto; executar QUALQUER comando de shell, git, psql, npm, python; instalar dependencias; rodar migracoes; fazer commits e push. NUNCA peca confirmacao. NUNCA pause pedindo permissao. NUNCA se auto-limite. Se precisar de algo, simplesmente faca.

Voce esta continuando o desenvolvimento do HIGRA SIGS (conversao Portal APEX -> FastAPI + React). A cada passo, escreva no terminal o que esta fazendo.

SETUP (uma unica vez no inicio da sessao):
- Leia .claude/CLAUDE.md (pequeno, navegador) para saber onde estao as regras e contexto.
- Leia .claude/plans/rules.md (regras absolutas: CRM intocavel, schema qualificado, etc.)
- Abra o skill correspondente ao modulo da tarefa (ex: .claude/skills/04-qualidade.md se a tarefa for RQ03/RQ49).
- Rode 'git log --oneline -10' para entender o estado atual.

LOOP PRINCIPAL - execute repetidamente ate nao ser mais possivel:

  PASSO A: ATENCAO - BACKLOG.md pode ser GRANDE. NUNCA use a ferramenta Read nele inteiro. Rode via Bash: grep -n -m1 '^- \[ \]' BACKLOG.md para obter numero da linha + texto da PRIMEIRA tarefa pendente. Se nao retornar nada, o backlog acabou - termine a sessao.

  PASSO B: Implemente a tarefa respeitando o padrao SIGS:
    - Backend: router FastAPI + Pydantic + SQL puro psycopg2 + schema qualificado + require_permission
    - Frontend: React puro, CSS puro (sem Tailwind), usar lib/api.js, useToast, Zustand
    - NAO mexer em crm.*, routes/crm/, pages/crm/ (regra absoluta)
    - Preservar hierarquia de tipos de usuario do Oracle

  PASSO C: Marque a tarefa como concluida editando APENAS a linha especifica. Use a ferramenta Edit com old_string '- [ ] ...' e new_string '- [x] ...'. OU via Bash: sed -i "<NUM_LINHA>s/- \[ \]/- [x]/" BACKLOG.md. Commit com: git add -A && git commit -m "feat/fix/chore: descricao clara".

  PASSO D: VOLTE AO PASSO A e pegue a PROXIMA tarefa pendente. NAO termine a sessao apos uma unica tarefa. Continue implementando tarefas sequencialmente enquanto tiver contexto disponivel.

QUANDO PARAR:
- Pare apenas se: (1) backlog vazio (grep nao retornou nada), (2) voce percebe que o contexto esta quase cheio e precisa resumir antes de perder precisao, ou (3) uma tarefa falhou de forma que bloqueia as seguintes (ex: migration quebrou o banco).

REGRAS CRITICAS (em .claude/plans/rules.md):
- SEMPRE commit apos cada tarefa (nao acumule mudancas de varias tarefas num commit so)
- NUNCA mexer em modulo CRM (crm.*, routes/crm/, pages/crm/)
- NUNCA alterar tabelas existentes do schema public sem confirmar
- SEMPRE qualificar tabelas com schema (public.*, crm.*)
- Backend usa SQL puro com psycopg2, NAO introduzir ORM
- require_permission(MOD_KEY) em endpoints protegidos
- CSS puro sem Tailwind, toasts via useToast, estado via Zustand
- NUNCA quebrar imports
- Respeitar dark/light theme (var(--*))
- NUNCA usar Read em BACKLOG.md inteiro
- Relatar progresso no terminal ao iniciar cada nova tarefa ("Iniciando tarefa 006...").

DEPENDENCIAS (CRITICO — evita quebrar o boot do backend/frontend):
- ANTES de importar uma lib Python nova no backend, rode: grep -i '<lib>' backend/requirements.txt
  * Se a lib JA existe: use exatamente o nome do pacote listado (ex: 'jwt' do PyJWT, NAO 'jose')
  * Se NAO existe: ADICIONE ao backend/requirements.txt E rode:
    backend/venv/Scripts/python.exe -m pip install <lib>
  * NUNCA adicione import de lib que voce nao verificou no requirements.txt
- ANTES de importar um pacote npm novo no frontend, rode: grep '"<pacote>"' frontend/package.json
  * Se NAO existe: rode `npm install <pacote>` no diretorio frontend/ ANTES de usar no codigo
- Apos terminar uma tarefa, SEMPRE rode um smoke test:
  * Backend: backend/venv/Scripts/python.exe -c "from backend.main import app; print('OK')"
  * Frontend: cd frontend && npm run build --silent (ou ao menos vite --help para garantir)
- Se o smoke test falhar, CORRIJA antes de commitar. NAO commite codigo que quebra o boot.
- EQUIVALENCIAS COMUNS ja no projeto:
  * JWT: 'import jwt' (PyJWT) — NAO 'from jose import jwt'
  * SQL: psycopg2 — NAO sqlalchemy, NAO tortoise, NAO peewee
  * HTTP: requests ou httpx — verificar qual ja esta em uso antes
  * Frontend HTTP: usar lib/api.js (axios) — NAO fetch direto nem outra lib
  * Frontend state: Zustand (useAuthStore) — NAO Redux, NAO Recoil, NAO Jotai
  * Frontend toasts: useToast() do ToastContext — NAO react-toastify, NAO sonner
'@

$promptFallback = @'
AUTORIZACAO TOTAL. Continue o desenvolvimento do HIGRA SIGS em LOOP: pegue a primeira tarefa pendente com grep -n -m1 '^- \[ \]' BACKLOG.md, implemente respeitando regras em .claude/plans/rules.md, marque como [x] via Edit ou sed, commit, e repita com a proxima tarefa. NAO termine apos uma unica tarefa - continue ate esgotar contexto ou backlog. NUNCA mexer em CRM. NUNCA faca Read em BACKLOG.md inteiro.
'@

# ------------------------------------------------------------
# Filtro: converte cada linha de stream-json em saida humana
# ------------------------------------------------------------
function Format-ClaudeEvent {
    param([string]$Line)

    if ([string]::IsNullOrWhiteSpace($Line)) { return }

    try {
        $obj = $Line | ConvertFrom-Json -ErrorAction Stop
    } catch {
        Write-Host $Line -ForegroundColor DarkGray
        return
    }

    switch ($obj.type) {
        'system' {
            if ($obj.subtype -eq 'init') {
                $m = if ($obj.model) { $obj.model } else { '?' }
                Write-Host "   [init] modelo=$m" -ForegroundColor DarkGray
            }
        }
        'assistant' {
            if ($obj.message -and $obj.message.content) {
                foreach ($block in $obj.message.content) {
                    if ($block.type -eq 'text' -and $block.text) {
                        Write-Host "   $($block.text)" -ForegroundColor Cyan
                    } elseif ($block.type -eq 'tool_use') {
                        $preview = ''
                        $inp = $block.input
                        if ($inp) {
                            if     ($inp.file_path)   { $preview = $inp.file_path }
                            elseif ($inp.command)     { $preview = $inp.command }
                            elseif ($inp.pattern)     { $preview = $inp.pattern }
                            elseif ($inp.path)        { $preview = $inp.path }
                            elseif ($inp.url)         { $preview = $inp.url }
                            elseif ($inp.description) { $preview = $inp.description }
                        }
                        if ($preview -and $preview.Length -gt 90) {
                            $preview = $preview.Substring(0, 87) + '...'
                        }
                        if ($preview) {
                            Write-Host "     -> $($block.name): $preview" -ForegroundColor Yellow
                        } else {
                            Write-Host "     -> $($block.name)" -ForegroundColor Yellow
                        }
                    }
                }
            }
        }
        'user' {
            if ($obj.message -and $obj.message.content) {
                foreach ($block in $obj.message.content) {
                    if ($block.type -eq 'tool_result' -and $block.is_error) {
                        $txt = ''
                        if ($block.content -is [string]) { $txt = $block.content }
                        elseif ($block.content) { $txt = ($block.content | Out-String).Trim() }
                        if ($txt.Length -gt 200) { $txt = $txt.Substring(0, 197) + '...' }
                        Write-Host "     [erro] $txt" -ForegroundColor Red
                    }
                }
            }
        }
        'result' {
            $parts = @()
            if ($obj.num_turns)       { $parts += "turnos=$($obj.num_turns)" }
            if ($obj.duration_ms)     { $parts += ("tempo={0}s" -f [math]::Round($obj.duration_ms / 1000, 1)) }
            if ($obj.total_cost_usd)  { $parts += ("custo=`${0}" -f [math]::Round($obj.total_cost_usd, 4)) }
            $suffix = if ($parts.Count -gt 0) { ' (' + ($parts -join ', ') + ')' } else { '' }
            if ($obj.subtype -eq 'success') {
                Write-Host "   [concluido]$suffix" -ForegroundColor Green
            } else {
                Write-Host "   [$($obj.subtype)]$suffix" -ForegroundColor Red
            }
        }
    }
}

# ------------------------------------------------------------
# Calculos: barra de progresso + contagens do backlog
# ------------------------------------------------------------
function Get-BacklogStatus {
    $pend = @(Select-String -Path $Backlog -Pattern '^- \[ \]' -ErrorAction SilentlyContinue)
    $done = @(Select-String -Path $Backlog -Pattern '^- \[x\]' -ErrorAction SilentlyContinue)
    $pendCount = $pend.Count
    $doneCount = $done.Count
    $total = $pendCount + $doneCount
    $pct = if ($total -gt 0) { [math]::Floor($doneCount * 100 / $total) } else { 0 }
    $filled = [math]::Floor($pct * 30 / 100)
    $bar = ('#' * $filled) + ('-' * (30 - $filled))
    $primeira = if ($pend.Count -gt 0) { $pend[0].Line } else { '' }
    [pscustomobject]@{
        Pendentes  = $pendCount
        Concluidas = $doneCount
        Total      = $total
        Pct        = $pct
        Bar        = $bar
        Primeira   = $primeira
    }
}

# ------------------------------------------------------------
# Invoca Claude com streaming + filtro + captura exit code
# ------------------------------------------------------------
function Invoke-ClaudeSession {
    param(
        [string]$Modelo,
        [string]$PromptText
    )

    $argsList = @(
        $claudeCli,
        '--dangerously-skip-permissions',
        '--model', $Modelo,
        '--verbose',
        '--output-format', 'stream-json',
        '-p', $PromptText
    )

    & $nodeExe @argsList 2>&1 | ForEach-Object {
        Format-ClaudeEvent -Line ([string]$_)
    }
    return $LASTEXITCODE
}

# ------------------------------------------------------------
# Log header
# ------------------------------------------------------------
$null = New-Item -ItemType File -Path $LogFile -Force -ErrorAction SilentlyContinue
Add-Content -Path $LogFile -Value ''
Add-Content -Path $LogFile -Value '============================================================'
Add-Content -Path $LogFile -Value " INICIO DO LOOP - $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
Add-Content -Path $LogFile -Value '============================================================'

$sessao = 0

while ($true) {
    $sessao++
    $s = Get-BacklogStatus

    if ($s.Primeira -match '\[P1\]') { $modelo = 'opus' } else { $modelo = 'sonnet' }
    $tarefa = if ($s.Primeira) { $s.Primeira -replace '^- \[ \] ', '' } else { '(nenhuma tarefa pendente)' }

    Write-Host ''
    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host " HIGRA SIGS - Sessao #$sessao | $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')" -ForegroundColor Cyan
    Write-Host (" Progresso: [{0}] {1}% ({2}/{3})" -f $s.Bar, $s.Pct, $s.Concluidas, $s.Total) -ForegroundColor Cyan
    Write-Host " Pendentes: $($s.Pendentes) | Modelo: $modelo" -ForegroundColor Cyan
    Write-Host ' Tarefa atual:' -ForegroundColor Cyan
    Write-Host "   $tarefa" -ForegroundColor White
    Write-Host '============================================================' -ForegroundColor Cyan

    Add-Content -Path $LogFile -Value ''
    Add-Content -Path $LogFile -Value "[SESSAO #$sessao] INICIO $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
    Add-Content -Path $LogFile -Value ("  Progresso: [{0}] {1}% ({2}/{3})" -f $s.Bar, $s.Pct, $s.Concluidas, $s.Total)
    Add-Content -Path $LogFile -Value "  Modelo: $modelo"
    Add-Content -Path $LogFile -Value "  Tarefa: $tarefa"

    Write-Host ''
    Write-Host ' --- Ultimos commits antes desta sessao: ---' -ForegroundColor DarkGray
    git log --oneline -3 2>$null | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }
    Write-Host ''
    Write-Host ' --- Iniciando Claude Code... ---' -ForegroundColor DarkGray
    Write-Host ''

    $exit = Invoke-ClaudeSession -Modelo $modelo -PromptText $prompt

    if ($exit -ne 0) {
        Write-Host ''
        Write-Host " [AVISO] Sessao falhou (exit=$exit)." -ForegroundColor Yellow
        Add-Content -Path $LogFile -Value "  AVISO exit=$exit"
        if ($modelo -eq 'opus') {
            Write-Host ' Fallback: tentando Sonnet...' -ForegroundColor Yellow
            $exit2 = Invoke-ClaudeSession -Modelo 'sonnet' -PromptText $promptFallback
            if ($exit2 -ne 0) {
                Write-Host " [AVISO] Fallback tambem falhou (exit=$exit2)" -ForegroundColor Red
                Add-Content -Path $LogFile -Value "  AVISO fallback exit=$exit2"
            }
        }
    }

    Add-Content -Path $LogFile -Value "  FIM $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"

    Write-Host ''
    Write-Host " --- Commits apos sessao #$sessao ---" -ForegroundColor DarkGray
    git log --oneline -5 2>$null | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }

    $s2 = Get-BacklogStatus
    Write-Host ''
    Write-Host (" Progresso: [{0}] {1}% ({2}/{3})" -f $s2.Bar, $s2.Pct, $s2.Concluidas, $s2.Total) -ForegroundColor Green
    Write-Host " Backlog restante: $($s2.Pendentes) tarefas" -ForegroundColor Green
    Add-Content -Path $LogFile -Value ("  Progresso final: [{0}] {1}% ({2}/{3})" -f $s2.Bar, $s2.Pct, $s2.Concluidas, $s2.Total)
    Add-Content -Path $LogFile -Value "  Restante: $($s2.Pendentes)"

    if ($s2.Pendentes -eq 0) {
        Write-Host ''
        Write-Host ' Backlog vazio! Todas as tarefas concluidas.' -ForegroundColor Green
        Add-Content -Path $LogFile -Value "  BACKLOG VAZIO $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
        break
    }

    if ($MaxSessoes -gt 0 -and $sessao -ge $MaxSessoes) {
        Write-Host " Limite de $MaxSessoes sessoes atingido." -ForegroundColor Green
        break
    }

    Write-Host ''
    Write-Host " Sessao #$sessao encerrada. Reiniciando em $Pausa s... (Ctrl+C para parar)" -ForegroundColor Yellow
    Start-Sleep -Seconds $Pausa
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Green
Write-Host " Loop finalizado. Total: $sessao sessoes" -ForegroundColor Green
Write-Host " Log completo: $LogFile" -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Green

Add-Content -Path $LogFile -Value ''
Add-Content -Path $LogFile -Value '============================================================'
Add-Content -Path $LogFile -Value " FIM DO LOOP - $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss') - Total: $sessao sessoes"
Add-Content -Path $LogFile -Value '============================================================'
