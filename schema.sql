PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
  id_usuarios INTEGER PRIMARY KEY AUTOINCREMENT,
  nome_completo TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  tipo_usuario TEXT NOT NULL DEFAULT 'usuario',
  data_cadastro TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS enderecos_usuarios (
  id_enderecos INTEGER PRIMARY KEY AUTOINCREMENT,
  id_usuarios INTEGER NOT NULL,
  rua TEXT NOT NULL, numero TEXT, bairro TEXT,
  cidade TEXT NOT NULL, estado TEXT NOT NULL, cep TEXT NOT NULL,
  latitude REAL, longitude REAL,
  FOREIGN KEY (id_usuarios) REFERENCES usuarios(id_usuarios) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tipos_materiais (
  id_material INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  categoria TEXT NOT NULL,
  pontos_por_quilo REAL NOT NULL CHECK (pontos_por_quilo >= 0)
);

-- Endereço opcional: os pontos da demonstração são fictícios e usam o mapa esquemático (mapa_x, mapa_y).
CREATE TABLE IF NOT EXISTS pontos_coleta (
  id_ponto INTEGER PRIMARY KEY AUTOINCREMENT,
  nome_local TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo',
  horario_funcionamento TEXT,
  rua TEXT, numero TEXT, bairro TEXT,
  cidade TEXT, estado TEXT, cep TEXT,
  latitude REAL, longitude REAL,
  mapa_x INTEGER, mapa_y INTEGER
);

CREATE TABLE IF NOT EXISTS materiais_aceitos_pontos (
  id_ponto INTEGER NOT NULL,
  id_material INTEGER NOT NULL,
  PRIMARY KEY (id_ponto, id_material),
  FOREIGN KEY (id_ponto) REFERENCES pontos_coleta(id_ponto) ON DELETE CASCADE,
  FOREIGN KEY (id_material) REFERENCES tipos_materiais(id_material) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS historico_descartes (
  id_descarte INTEGER PRIMARY KEY AUTOINCREMENT,
  id_usuarios INTEGER NOT NULL,
  id_ponto INTEGER NOT NULL,
  data_descarte TEXT DEFAULT CURRENT_TIMESTAMP,
  total_pontos_ganhos INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (id_usuarios) REFERENCES usuarios(id_usuarios) ON DELETE CASCADE,
  FOREIGN KEY (id_ponto) REFERENCES pontos_coleta(id_ponto) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS itens_descarte (
  id_item INTEGER PRIMARY KEY AUTOINCREMENT,
  id_descarte INTEGER NOT NULL,
  id_material INTEGER NOT NULL,
  peso_kg REAL NOT NULL CHECK (peso_kg > 0),
  FOREIGN KEY (id_descarte) REFERENCES historico_descartes(id_descarte) ON DELETE CASCADE,
  FOREIGN KEY (id_material) REFERENCES tipos_materiais(id_material)
);

CREATE TABLE IF NOT EXISTS carteira_pontos (
  id_carteira INTEGER PRIMARY KEY AUTOINCREMENT,
  id_usuarios INTEGER NOT NULL UNIQUE,
  saldo_pontos_atual INTEGER NOT NULL DEFAULT 0 CHECK (saldo_pontos_atual >= 0),
  FOREIGN KEY (id_usuarios) REFERENCES usuarios(id_usuarios) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recompensas_disponiveis (
  id_recompensa INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL, descricao TEXT,
  custo_em_pontos INTEGER NOT NULL CHECK (custo_em_pontos >= 0),
  quantidade_estoque INTEGER NOT NULL DEFAULT 0 CHECK (quantidade_estoque >= 0)
);

CREATE TABLE IF NOT EXISTS historico_resgates (
  id_resgate INTEGER PRIMARY KEY AUTOINCREMENT,
  id_usuarios INTEGER NOT NULL,
  id_recompensa INTEGER NOT NULL,
  data_resgate TEXT DEFAULT CURRENT_TIMESTAMP,
  codigo_cupom_gerado TEXT NOT NULL UNIQUE,
  FOREIGN KEY (id_usuarios) REFERENCES usuarios(id_usuarios) ON DELETE CASCADE,
  FOREIGN KEY (id_recompensa) REFERENCES recompensas_disponiveis(id_recompensa) ON DELETE CASCADE
);

-- Central de informações: lixeiras e leituras de peso.
-- id_leitura é PRIMARY KEY: reenviar a mesma leitura (fila offline) nunca duplica.
CREATE TABLE IF NOT EXISTS lixeiras (
  id_lixeira TEXT PRIMARY KEY,
  categoria TEXT NOT NULL,
  mapa_x INTEGER, mapa_y INTEGER
);

CREATE TABLE IF NOT EXISTS leituras (
  id_leitura TEXT PRIMARY KEY,
  id_lixeira TEXT NOT NULL,
  peso_kg REAL NOT NULL CHECK (peso_kg > 0),
  data_hora TEXT NOT NULL,
  simulado INTEGER NOT NULL DEFAULT 1,
  recebido_em TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_lixeira) REFERENCES lixeiras(id_lixeira)
);

CREATE TABLE IF NOT EXISTS catalogo_residuos (
  id_residuo INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL,
  como_descartar TEXT NOT NULL,
  dica TEXT
);

CREATE INDEX IF NOT EXISTS idx_leituras_data ON leituras(data_hora);
CREATE INDEX IF NOT EXISTS idx_descartes_usuario ON historico_descartes(id_usuarios, id_descarte);
