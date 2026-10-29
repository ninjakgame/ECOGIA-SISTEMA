const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const db = new Database(process.env.DB_FILE || path.join(__dirname, "ecoguia.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));

const vazio = tabela => db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get().n === 0;

// Mesmos dados do protótipo original do EcoGuia (o front usa estes valores como reserva se o servidor estiver desligado).
const MATERIAIS = [["Papel e papelão", 10], ["Plástico", 12], ["Vidro", 8], ["Metais", 15], ["Eletrônicos e pilhas", 20]];

const CATALOGO = [
  ["Garrafa PET", "Plástico", "Esvazie, enxágue rápido, amasse e tampe.", "Rótulo pode ficar."],
  ["Pote de margarina", "Plástico", "Retire restos e enxágue.", "Só precisa estar sem resíduo de comida."],
  ["Caixa de papelão", "Papel e papelão", "Desmonte e mantenha seca.", "Papelão engordurado ou molhado não recicla."],
  ["Caixa de pizza", "Papel e papelão", "Recicle só a parte limpa; a parte com gordura vai para o lixo comum.", "Rasgue e separe."],
  ["Jornal e revista", "Papel e papelão", "Mantenha seco e sem restos.", "Evite papel molhado ou sujo."],
  ["Garrafa de vidro", "Vidro", "Esvazie, enxágue e entregue inteira.", "Cacos: embrulhe em papel e identifique."],
  ["Lata de alumínio", "Metais", "Esvazie e enxágue; pode amassar.", "Aerossóis: confirme a regra do ponto."],
  ["Lata de aço (conserva)", "Metais", "Retire restos e enxágue.", "Cuidado com a borda cortante."],
  ["Pilha e bateria", "Eletrônicos e pilhas", "Nunca no lixo comum. Leve a ponto específico.", "Guarde longe de umidade e calor."],
  ["Celular e carregador", "Eletrônicos e pilhas", "Apague seus dados e leve a ponto de eletrônicos.", "Não desmonte a bateria."],
  ["Fralda descartável", "Não reciclável", "Vai para o lixo comum, bem embalada.", "Não é reciclável."]
];

// [nome, materiais aceitos, x, y no mapa esquemático]. Pontos fictícios de demonstração.
const PONTOS = [
  ["Ponto Campus A", ["Plástico", "Papel e papelão", "Metais"], 90, 70],
  ["Depósito Verde Centro", ["Vidro", "Metais", "Papel e papelão"], 300, 60],
  ["Ecoponto Bairro Norte", ["Eletrônicos e pilhas", "Plástico"], 310, 210],
  ["Cooperativa Modelo", ["Plástico", "Papel e papelão", "Vidro", "Metais"], 80, 215]
];

const LIXEIRAS = [
  ["LX-001", "Plástico", 150, 120],
  ["LX-002", "Papel e papelão", 240, 100],
  ["LX-003", "Vidro", 230, 180],
  ["LX-004", "Metais", 140, 185]
];

const DEMO = "Recompensa demonstrativa do protótipo.";
const RECOMPENSAS = [["Ecobag UNINASSAU", DEMO, 60, 20], ["Kit sustentável", DEMO, 100, 10], ["Muda de planta nativa", DEMO, 150, 10]];

db.transaction(() => {
  if (vazio("tipos_materiais")) {
    const ins = db.prepare("INSERT INTO tipos_materiais (nome,categoria,pontos_por_quilo) VALUES (?,?,?)");
    MATERIAIS.forEach(([nome, ppk]) => ins.run(nome, nome, ppk));
  }
  if (vazio("catalogo_residuos")) {
    const ins = db.prepare("INSERT INTO catalogo_residuos (nome,categoria,como_descartar,dica) VALUES (?,?,?,?)");
    CATALOGO.forEach(r => ins.run(...r));
  }
  if (vazio("pontos_coleta")) {
    const ponto = db.prepare("INSERT INTO pontos_coleta (nome_local,mapa_x,mapa_y) VALUES (?,?,?)");
    const material = db.prepare("SELECT id_material FROM tipos_materiais WHERE nome=?");
    const liga = db.prepare("INSERT INTO materiais_aceitos_pontos (id_ponto,id_material) VALUES (?,?)");
    PONTOS.forEach(([nome, aceitos, x, y]) => {
      const id = ponto.run(nome, x, y).lastInsertRowid;
      aceitos.forEach(a => liga.run(id, material.get(a).id_material));
    });
  }
  if (vazio("lixeiras")) {
    const ins = db.prepare("INSERT INTO lixeiras (id_lixeira,categoria,mapa_x,mapa_y) VALUES (?,?,?,?)");
    LIXEIRAS.forEach(l => ins.run(...l));
  }
  if (vazio("recompensas_disponiveis")) {
    const ins = db.prepare("INSERT INTO recompensas_disponiveis (titulo,descricao,custo_em_pontos,quantidade_estoque) VALUES (?,?,?,?)");
    RECOMPENSAS.forEach(r => ins.run(...r));
  }
})();

// Segredo que assina as sessões. Use ECO_SECRET em produção; sem ele, um segredo é gerado e guardado no banco.
let secret = process.env.ECO_SECRET;
if (!secret) {
  const linha = db.prepare("SELECT valor FROM config WHERE chave='secret'").get();
  secret = linha ? linha.valor : crypto.randomBytes(32).toString("hex");
  if (!linha) db.prepare("INSERT INTO config (chave,valor) VALUES ('secret',?)").run(secret);
}

// Funcionários da central ficam na mesma tabela de usuários, com tipo_usuario = 'funcionario'.
// Nunca são criados pelo cadastro público: só por criar-funcionario.js ou pelas variáveis ECO_STAFF_*.
function garantirFuncionario(nome, email, senha) {
  email = String(email).trim().toLowerCase();
  const hash = bcrypt.hashSync(senha, 12);
  const u = db.prepare("SELECT id_usuarios, tipo_usuario FROM usuarios WHERE email=?").get(email);
  if (!u) {
    db.prepare("INSERT INTO usuarios (nome_completo,email,senha_hash,tipo_usuario) VALUES (?,?,?,'funcionario')").run(nome, email, hash);
    return "criado";
  }
  if (u.tipo_usuario !== "funcionario") throw new Error("Este e-mail já pertence a uma conta de cliente. Use outro e-mail.");
  db.prepare("UPDATE usuarios SET nome_completo=?, senha_hash=? WHERE id_usuarios=?").run(nome, hash, u.id_usuarios);
  return "atualizado";
}

const temFuncionario = () => !!db.prepare("SELECT 1 FROM usuarios WHERE tipo_usuario='funcionario' LIMIT 1").get();

module.exports = { db, secret, garantirFuncionario, temFuncionario };
