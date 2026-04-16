-- Memória técnica - casos
CREATE TABLE IF NOT EXISTS nexus_casos_tecnicos (
    id UUID PRIMARY KEY,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW(),
    usuario_id TEXT NULL,
    titulo TEXT NOT NULL,
    dominio TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'aberto',
    resumo TEXT,
    tags JSONB DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS nexus_casos_dados (
    id UUID PRIMARY KEY,
    caso_id UUID NOT NULL REFERENCES nexus_casos_tecnicos(id) ON DELETE CASCADE,
    dados JSONB NOT NULL,
    fonte TEXT NOT NULL,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nexus_casos_eventos (
    id UUID PRIMARY KEY,
    caso_id UUID NOT NULL REFERENCES nexus_casos_tecnicos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    conteudo TEXT,
    meta JSONB DEFAULT '{}'::jsonb,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_casos_dominio ON nexus_casos_tecnicos (dominio);
CREATE INDEX IF NOT EXISTS idx_casos_status ON nexus_casos_tecnicos (status);
CREATE INDEX IF NOT EXISTS idx_casos_tags ON nexus_casos_tecnicos USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_dados_json ON nexus_casos_dados USING GIN (dados);
