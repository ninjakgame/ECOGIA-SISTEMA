// Uso: node criar-funcionario.js "Nome Completo" email@exemplo.com "senha-com-8-ou-mais-caracteres"
// Cria o acesso de um funcionário da central (ou troca a senha, se ele já existir).
const { garantirFuncionario } = require("./database");

const [nome, email, senha] = process.argv.slice(2);
if (!nome || !email || !senha) {
  console.error('Uso: node criar-funcionario.js "Nome Completo" email@exemplo.com "senha"');
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || senha.length < 8 || senha.length > 72) {
  console.error("Informe um e-mail válido e uma senha de 8 a 72 caracteres.");
  process.exit(1);
}
try {
  console.log(`Funcionário ${garantirFuncionario(nome.trim(), email, senha)}: ${email.toLowerCase()}`);
  console.log("Acesso em /funcionario");
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
