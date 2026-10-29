const express = require("express");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { db, secret, garantirFuncionario, temFuncionario } = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin" });
  next();
});
app.use(express.json({ limit: "20kb" }));
// Dois sites separados: "public" é o site do cliente; "staff" é a área do funcionário, em /funcionario.
// Nada de "staff" fica dentro de "public", e o site do cliente não tem link nem referência à área do funcionário.
// O código, o schema e o arquivo .sqlite ficam fora do alcance do navegador.
app.use("/funcionario", (_req, res, next) => {
  res.set({ "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" });
  next();
}, express.static(path.join(__dirname, "staff")));
app.use(express.static(path.join(__dirname, "public")));

/* ---------- utilidades ---------- */
class Erro extends Error { constructor(status, msg) { super(msg); this.status = status; } }
function falha(res, e, padrao) {
  if (e instanceof Erro) return res.status(e.status).json({ erro: e.message });
  console.error(e);
  res.status(500).json({ erro: padrao });
}

const assina = p => crypto.createHmac("sha256", secret).update(p).digest("base64url");
// Papel no token: "u" = cliente (7 dias), "f" = funcionário (8 horas). Um token de um papel nunca vale no outro.
function emiteToken(id, papel = "u") {
  const validade = papel === "f" ? 8 * 36e5 : 7 * 864e5;
  const corpo = Buffer.from(JSON.stringify({ id, p: papel, exp: Date.now() + validade })).toString("base64url");
  return `${corpo}.${assina(corpo)}`;
}
function lerToken(req) {
  const [corpo, sig] = (req.get("authorization") || "").replace(/^Bearer /, "").split(".");
  if (!corpo || !sig) throw 0;
  const a = Buffer.from(sig), b = Buffer.from(assina(corpo));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw 0;
  const dados = JSON.parse(Buffer.from(corpo, "base64url"));
  if (!(dados.exp > Date.now())) throw 0;
  return dados;
}
function auth(req, res, next) {
  try {
    const dados = lerToken(req);
    if ((dados.p || "u") !== "u") throw 0;
    req.uid = dados.id;
    next();
  } catch {
    res.status(401).json({ erro: "Sessão expirada. Entre novamente." });
  }
}
// Rotas do funcionário: quem não é funcionário recebe 404, como se elas não existissem.
function staff(req, res, next) {
  try {
    const dados = lerToken(req);
    if (dados.p !== "f" || !db.prepare("SELECT 1 FROM usuarios WHERE id_usuarios=? AND tipo_usuario='funcionario'").get(dados.id)) throw 0;
    req.uid = dados.id;
    next();
  } catch {
    res.status(404).json({ erro: "Rota não encontrada." });
  }
}

const tentativas = new Map();
setInterval(() => tentativas.clear(), 3600e3).unref();
const limite = (max, ms) => (req, res, next) => {
  const chave = req.ip + req.path, agora = Date.now();
  const recentes = (tentativas.get(chave) || []).filter(t => agora - t < ms);
  if (recentes.length >= max) return res.status(429).json({ erro: "Muitas tentativas. Aguarde alguns minutos." });
  recentes.push(agora);
  tentativas.set(chave, recentes);
  next();
};

/* ---------- dados públicos ---------- */
app.get("/api/health", (_req, res) => res.json({ ok: true, app: "EcoGuia UNINASSAU", database: "SQLite" }));

app.get("/api/catalogo", (_req, res) => {
  res.json(db.prepare("SELECT nome,categoria,como_descartar AS como,dica FROM catalogo_residuos ORDER BY id_residuo").all());
});

app.get("/api/materiais", (_req, res) => {
  res.json(db.prepare("SELECT id_material,nome,categoria,pontos_por_quilo FROM tipos_materiais ORDER BY id_material").all());
});

app.get("/api/pontos", (_req, res) => {
  const pontos = db.prepare(`SELECT id_ponto AS id, nome_local AS nome, horario_funcionamento AS horario, mapa_x AS x, mapa_y AS y
    FROM pontos_coleta WHERE status='ativo' ORDER BY id_ponto`).all();
  const materiais = db.prepare(`SELECT t.id_material AS id, t.nome AS categoria, t.pontos_por_quilo
    FROM materiais_aceitos_pontos a JOIN tipos_materiais t ON t.id_material=a.id_material
    WHERE a.id_ponto=? ORDER BY t.id_material`);
  res.json(pontos.map(p => ({ ...p, materiais: materiais.all(p.id) })));
});

app.get("/api/recompensas", (_req, res) => {
  res.json(db.prepare(`SELECT id_recompensa AS id, titulo, descricao, custo_em_pontos AS custo, quantidade_estoque AS estoque
    FROM recompensas_disponiveis WHERE quantidade_estoque > 0 ORDER BY custo_em_pontos`).all());
});

/* ---------- central de informações: entrada das leituras das lixeiras (equipamento) ---------- */
// Se ECO_DEVICE_KEY estiver definida, o equipamento precisa enviá-la no cabeçalho x-device-key.
const CHAVE_DISPOSITIVO = process.env.ECO_DEVICE_KEY;
app.post("/api/leituras", limite(120, 60e3), (req, res) => {
  if (CHAVE_DISPOSITIVO && req.get("x-device-key") !== CHAVE_DISPOSITIVO) return res.status(401).json({ erro: "Chave do dispositivo inválida." });
  const { id_leitura, id_dispositivo, peso_kg, data_hora, simulado } = req.body || {};
  const peso = Number(peso_kg), quando = new Date(data_hora);
  if (typeof id_leitura !== "string" || !id_leitura || id_leitura.length > 80 || !(peso > 0 && peso <= 200) || isNaN(quando)) {
    return res.status(400).json({ erro: "Leitura inválida." });
  }
  if (!db.prepare("SELECT 1 FROM lixeiras WHERE id_lixeira=?").get(String(id_dispositivo))) {
    return res.status(404).json({ erro: "Lixeira não cadastrada." });
  }
  const r = db.prepare("INSERT OR IGNORE INTO leituras (id_leitura,id_lixeira,peso_kg,data_hora,simulado) VALUES (?,?,?,?,?)")
    .run(id_leitura, id_dispositivo, peso, quando.toISOString(), simulado === false ? 0 : 1);
  res.status(r.changes ? 201 : 200).json({ duplicada: !r.changes });
});

/* ---------- contas ---------- */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HASH_FALSO = bcrypt.hashSync("senha-falsa", 12); // iguala o tempo de resposta quando o e-mail não existe

app.post("/api/usuarios", limite(10, 600e3), async (req, res) => {
  const nome = String(req.body?.nome_completo || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const senha = String(req.body?.senha || "");
  if (nome.length < 2 || nome.length > 120 || !EMAIL.test(email) || senha.length < 8 || senha.length > 72) {
    return res.status(400).json({ erro: "Informe nome, e-mail válido e uma senha de 8 a 72 caracteres." });
  }
  try {
    const hash = await bcrypt.hash(senha, 12);
    const id = db.transaction(() => {
      const novo = db.prepare("INSERT INTO usuarios (nome_completo,email,senha_hash) VALUES (?,?,?)").run(nome, email, hash).lastInsertRowid;
      db.prepare("INSERT INTO carteira_pontos (id_usuarios) VALUES (?)").run(novo);
      return novo;
    })();
    res.status(201).json({ id_usuarios: id, mensagem: "Cadastro realizado." });
  } catch (e) {
    if (String(e.code).startsWith("SQLITE_CONSTRAINT")) return res.status(409).json({ erro: "Este e-mail já está cadastrado." });
    falha(res, e, "Não foi possível cadastrar o usuário.");
  }
});

app.post("/api/login", limite(10, 600e3), async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const senha = String(req.body?.senha || "");
  const u = db.prepare("SELECT id_usuarios, nome_completo, senha_hash FROM usuarios WHERE email=? AND tipo_usuario='usuario'").get(email);
  const ok = await bcrypt.compare(senha, u ? u.senha_hash : HASH_FALSO);
  if (!u || !ok) return res.status(401).json({ erro: "E-mail ou senha inválidos." });
  res.json({ token: emiteToken(u.id_usuarios), nome_completo: u.nome_completo });
});

app.get("/api/me", auth, (req, res) => {
  const u = db.prepare(`SELECT u.id_usuarios AS id, u.nome_completo AS nome, u.email, COALESCE(c.saldo_pontos_atual,0) AS saldo
    FROM usuarios u LEFT JOIN carteira_pontos c ON c.id_usuarios=u.id_usuarios WHERE u.id_usuarios=?`).get(req.uid);
  if (!u) return res.status(401).json({ erro: "Sessão inválida." });
  u.descartes = db.prepare(`SELECT d.data_descarte AS data, p.nome_local AS ponto, d.total_pontos_ganhos AS pontos
    FROM historico_descartes d JOIN pontos_coleta p ON p.id_ponto=d.id_ponto
    WHERE d.id_usuarios=? ORDER BY d.id_descarte DESC LIMIT 8`).all(req.uid);
  u.resgates = db.prepare(`SELECT r.codigo_cupom_gerado AS codigo, v.titulo, r.data_resgate AS data
    FROM historico_resgates r JOIN recompensas_disponiveis v ON v.id_recompensa=r.id_recompensa
    WHERE r.id_usuarios=? ORDER BY r.id_resgate DESC LIMIT 8`).all(req.uid);
  res.json(u);
});

/* ---------- pontos e recompensas ---------- */
app.post("/api/descartes", auth, (req, res) => {
  const { id_ponto, itens } = req.body || {};
  if (!Number.isInteger(id_ponto) || !Array.isArray(itens) || !itens.length || itens.length > 10) {
    return res.status(400).json({ erro: "Informe o ponto de coleta e de 1 a 10 itens." });
  }
  try {
    const resultado = db.transaction(() => {
      if (!db.prepare("SELECT 1 FROM pontos_coleta WHERE id_ponto=? AND status='ativo'").get(id_ponto)) throw new Erro(404, "Ponto de coleta não encontrado.");
      const ultimaHora = db.prepare("SELECT COUNT(*) AS n FROM historico_descartes WHERE id_usuarios=? AND data_descarte > datetime('now','-1 hour')").get(req.uid).n;
      if (ultimaHora >= 5) throw new Erro(429, "Limite de 5 descartes por hora atingido.");
      const taxa = db.prepare(`SELECT t.pontos_por_quilo FROM tipos_materiais t
        JOIN materiais_aceitos_pontos a ON a.id_material=t.id_material WHERE a.id_ponto=? AND t.id_material=?`);
      let pontos = 0;
      const validos = [];
      for (const item of itens) {
        const peso = Number(item.peso_kg), material = Number(item.id_material);
        if (!(peso > 0 && peso <= 20)) throw new Erro(400, "Cada item deve ter entre 0,01 e 20 kg.");
        const t = taxa.get(id_ponto, material);
        if (!t) throw new Erro(400, "Esse ponto não aceita um dos materiais informados.");
        pontos += Math.floor(peso * t.pontos_por_quilo);
        validos.push([material, peso]);
      }
      const id = db.prepare("INSERT INTO historico_descartes (id_usuarios,id_ponto,total_pontos_ganhos) VALUES (?,?,?)").run(req.uid, id_ponto, pontos).lastInsertRowid;
      const ins = db.prepare("INSERT INTO itens_descarte (id_descarte,id_material,peso_kg) VALUES (?,?,?)");
      validos.forEach(([m, p]) => ins.run(id, m, p));
      db.prepare("UPDATE carteira_pontos SET saldo_pontos_atual = saldo_pontos_atual + ? WHERE id_usuarios=?").run(pontos, req.uid);
      return { id_descarte: id, total_pontos_ganhos: pontos };
    })();
    res.status(201).json(resultado);
  } catch (e) { falha(res, e, "Não foi possível registrar o descarte."); }
});

app.post("/api/resgates", auth, (req, res) => {
  const idRecompensa = Number(req.body?.id_recompensa);
  try {
    const resultado = db.transaction(() => {
      const r = db.prepare("SELECT custo_em_pontos, quantidade_estoque FROM recompensas_disponiveis WHERE id_recompensa=?").get(idRecompensa);
      if (!r || r.quantidade_estoque < 1) throw new Erro(409, "Recompensa indisponível.");
      const debito = db.prepare("UPDATE carteira_pontos SET saldo_pontos_atual = saldo_pontos_atual - ? WHERE id_usuarios=? AND saldo_pontos_atual >= ?")
        .run(r.custo_em_pontos, req.uid, r.custo_em_pontos);
      if (!debito.changes) throw new Erro(400, "Saldo de pontos insuficiente.");
      db.prepare("UPDATE recompensas_disponiveis SET quantidade_estoque = quantidade_estoque - 1 WHERE id_recompensa=?").run(idRecompensa);
      const codigo = "ECO-" + crypto.randomBytes(5).toString("hex").toUpperCase();
      db.prepare("INSERT INTO historico_resgates (id_usuarios,id_recompensa,codigo_cupom_gerado) VALUES (?,?,?)").run(req.uid, idRecompensa, codigo);
      return { codigo_cupom_gerado: codigo };
    })();
    res.status(201).json(resultado);
  } catch (e) { falha(res, e, "Não foi possível realizar o resgate."); }
});

/* ---------- área do funcionário (tudo em /api/staff, protegido por token de funcionário) ---------- */
app.post("/api/staff/login", limite(10, 600e3), async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const senha = String(req.body?.senha || "");
  const u = db.prepare("SELECT id_usuarios, nome_completo, senha_hash FROM usuarios WHERE email=? AND tipo_usuario='funcionario'").get(email);
  const ok = await bcrypt.compare(senha, u ? u.senha_hash : HASH_FALSO);
  if (!u || !ok) return res.status(401).json({ erro: "E-mail ou senha inválidos." });
  res.json({ token: emiteToken(u.id_usuarios, "f"), nome_completo: u.nome_completo });
});

app.get("/api/staff/me", staff, (req, res) => {
  res.json(db.prepare("SELECT nome_completo AS nome, email FROM usuarios WHERE id_usuarios=?").get(req.uid));
});

const um = (sql, ...p) => db.prepare(sql).get(...p);
const lim = (v, padrao = 50) => Math.min(Math.max(parseInt(v, 10) || padrao, 1), 200);

app.get("/api/staff/resumo", staff, (_req, res) => {
  const porCategoria = db.prepare(`SELECT l.categoria, ROUND(SUM(r.peso_kg),2) AS kg, COUNT(*) AS leituras
    FROM leituras r JOIN lixeiras l ON l.id_lixeira=r.id_lixeira GROUP BY l.categoria ORDER BY kg DESC`).all();
  res.json({
    total_kg: Math.round(porCategoria.reduce((s, x) => s + x.kg, 0) * 100) / 100,
    leituras: um("SELECT COUNT(*) AS n FROM leituras").n,
    por_categoria: porCategoria,
    lixeiras: um("SELECT COUNT(*) AS n FROM lixeiras").n,
    clientes: um("SELECT COUNT(*) AS n FROM usuarios WHERE tipo_usuario='usuario'").n,
    descartes: um("SELECT COUNT(*) AS n FROM historico_descartes").n,
    kg_entregues: um("SELECT ROUND(COALESCE(SUM(peso_kg),0),2) AS kg FROM itens_descarte").kg,
    pontos_distribuidos: um("SELECT COALESCE(SUM(total_pontos_ganhos),0) AS n FROM historico_descartes").n,
    pontos_em_carteira: um("SELECT COALESCE(SUM(saldo_pontos_atual),0) AS n FROM carteira_pontos").n,
    resgates: um("SELECT COUNT(*) AS n FROM historico_resgates").n,
    recentes: db.prepare(`SELECT r.id_lixeira, l.categoria, r.peso_kg, r.data_hora
      FROM leituras r JOIN lixeiras l ON l.id_lixeira=r.id_lixeira ORDER BY r.data_hora DESC LIMIT 8`).all()
  });
});

app.get("/api/staff/lixeiras", staff, (_req, res) => {
  res.json(db.prepare(`SELECT x.id_lixeira AS id, x.categoria, x.mapa_x AS x, x.mapa_y AS y,
      COALESCE(ROUND(SUM(r.peso_kg),2),0) AS total_kg, COUNT(r.id_leitura) AS leituras, MAX(r.data_hora) AS ultima
    FROM lixeiras x LEFT JOIN leituras r ON r.id_lixeira=x.id_lixeira GROUP BY x.id_lixeira ORDER BY x.id_lixeira`).all());
});

app.get("/api/staff/leituras", staff, (req, res) => {
  res.json(db.prepare(`SELECT r.id_leitura AS id, r.id_lixeira, l.categoria, r.peso_kg, r.data_hora, r.simulado
    FROM leituras r JOIN lixeiras l ON l.id_lixeira=r.id_lixeira ORDER BY r.data_hora DESC LIMIT ?`).all(lim(req.query.limite, 40)));
});

// Leitura simulada pela central (demonstração), sem precisar do equipamento.
app.post("/api/staff/leituras", staff, (req, res) => {
  const id = String(req.body?.id_lixeira || ""), peso = Number(req.body?.peso_kg);
  if (!(peso > 0 && peso <= 200)) return res.status(400).json({ erro: "Informe um peso entre 0,01 e 200 kg." });
  if (!um("SELECT 1 FROM lixeiras WHERE id_lixeira=?", id)) return res.status(404).json({ erro: "Lixeira não cadastrada." });
  const idLeitura = `${id}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  db.prepare("INSERT INTO leituras (id_leitura,id_lixeira,peso_kg,data_hora,simulado) VALUES (?,?,?,?,1)")
    .run(idLeitura, id, Math.round(peso * 100) / 100, new Date().toISOString());
  res.status(201).json({ id_leitura: idLeitura });
});

app.get("/api/staff/clientes", staff, (_req, res) => {
  res.json(db.prepare(`SELECT u.id_usuarios AS id, u.nome_completo AS nome, u.email, u.data_cadastro AS cadastro,
      COALESCE(c.saldo_pontos_atual,0) AS saldo,
      (SELECT COUNT(*) FROM historico_descartes d WHERE d.id_usuarios=u.id_usuarios) AS descartes,
      (SELECT COALESCE(ROUND(SUM(i.peso_kg),2),0) FROM itens_descarte i JOIN historico_descartes d ON d.id_descarte=i.id_descarte WHERE d.id_usuarios=u.id_usuarios) AS kg
    FROM usuarios u LEFT JOIN carteira_pontos c ON c.id_usuarios=u.id_usuarios
    WHERE u.tipo_usuario='usuario' ORDER BY u.id_usuarios DESC LIMIT 500`).all());
});

app.get("/api/staff/descartes", staff, (req, res) => {
  res.json(db.prepare(`SELECT d.id_descarte AS id, d.data_descarte AS data, u.nome_completo AS cliente, p.nome_local AS ponto,
      d.total_pontos_ganhos AS pontos,
      (SELECT ROUND(SUM(peso_kg),2) FROM itens_descarte i WHERE i.id_descarte=d.id_descarte) AS kg,
      (SELECT GROUP_CONCAT(t.nome, ', ') FROM itens_descarte i JOIN tipos_materiais t ON t.id_material=i.id_material WHERE i.id_descarte=d.id_descarte) AS materiais
    FROM historico_descartes d JOIN usuarios u ON u.id_usuarios=d.id_usuarios JOIN pontos_coleta p ON p.id_ponto=d.id_ponto
    ORDER BY d.id_descarte DESC LIMIT ?`).all(lim(req.query.limite, 50)));
});

app.get("/api/staff/pontos", staff, (_req, res) => {
  const pontos = db.prepare("SELECT id_ponto AS id, nome_local AS nome, status, horario_funcionamento AS horario, mapa_x AS x, mapa_y AS y FROM pontos_coleta ORDER BY id_ponto").all();
  const mats = db.prepare("SELECT t.nome FROM materiais_aceitos_pontos a JOIN tipos_materiais t ON t.id_material=a.id_material WHERE a.id_ponto=? ORDER BY t.id_material");
  res.json(pontos.map(p => ({ ...p, materiais: mats.all(p.id).map(m => m.nome) })));
});

app.patch("/api/staff/pontos/:id", staff, (req, res) => {
  const status = req.body?.status;
  if (!["ativo", "inativo"].includes(status)) return res.status(400).json({ erro: "Status inválido." });
  const r = db.prepare("UPDATE pontos_coleta SET status=? WHERE id_ponto=?").run(status, Number(req.params.id));
  if (!r.changes) return res.status(404).json({ erro: "Ponto não encontrado." });
  res.json({ ok: true });
});

app.get("/api/staff/recompensas", staff, (_req, res) => {
  res.json(db.prepare("SELECT id_recompensa AS id, titulo, descricao, custo_em_pontos AS custo, quantidade_estoque AS estoque FROM recompensas_disponiveis ORDER BY custo_em_pontos").all());
});

app.patch("/api/staff/recompensas/:id", staff, (req, res) => {
  const custo = Number(req.body?.custo), estoque = Number(req.body?.estoque);
  if (!Number.isInteger(custo) || !Number.isInteger(estoque) || custo < 0 || estoque < 0 || custo > 100000 || estoque > 100000) {
    return res.status(400).json({ erro: "Custo e estoque devem ser números inteiros, sem valores negativos." });
  }
  const r = db.prepare("UPDATE recompensas_disponiveis SET custo_em_pontos=?, quantidade_estoque=? WHERE id_recompensa=?").run(custo, estoque, Number(req.params.id));
  if (!r.changes) return res.status(404).json({ erro: "Recompensa não encontrada." });
  res.json({ ok: true });
});

app.get("/api/staff/resgates", staff, (req, res) => {
  res.json(db.prepare(`SELECT r.codigo_cupom_gerado AS codigo, r.data_resgate AS data, v.titulo, v.custo_em_pontos AS custo, u.nome_completo AS cliente
    FROM historico_resgates r JOIN recompensas_disponiveis v ON v.id_recompensa=r.id_recompensa JOIN usuarios u ON u.id_usuarios=r.id_usuarios
    ORDER BY r.id_resgate DESC LIMIT ?`).all(lim(req.query.limite, 50)));
});

/* ---------- fallbacks ---------- */
app.use("/api", (_req, res) => res.status(404).json({ erro: "Rota não encontrada." }));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.use((e, _req, res, _next) => {
  res.status(e.status && e.status < 500 ? e.status : 500).json({ erro: e.status && e.status < 500 ? "Requisição inválida." : "Erro interno." });
});

// Acesso do funcionário. Com ECO_STAFF_* ele é criado/atualizado a cada início.
// Sem elas, se ainda não existir nenhum funcionário, cria o acesso padrão abaixo (troque a senha antes de publicar).
const PADRAO = { nome: "Funcionário", email: "funcionario@gmail.com", senha: "funcionario123" };
try {
  if (process.env.ECO_STAFF_EMAIL && process.env.ECO_STAFF_SENHA) {
    const r = garantirFuncionario(process.env.ECO_STAFF_NOME || "Funcionário", process.env.ECO_STAFF_EMAIL, process.env.ECO_STAFF_SENHA);
    console.log(`Funcionário ${r}: ${process.env.ECO_STAFF_EMAIL}`);
  } else if (!temFuncionario()) {
    garantirFuncionario(PADRAO.nome, PADRAO.email, PADRAO.senha);
    console.log(`Funcionário padrão criado: ${PADRAO.email}`);
  }
} catch (e) { console.error("Funcionário:", e.message); }

app.listen(PORT, () => {
  console.log(`Site do cliente:       http://localhost:${PORT}`);
  console.log(`Área do funcionário:   http://localhost:${PORT}/funcionario`);
});
