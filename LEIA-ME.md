# EcoGuia UNINASSAU — dois sites separados

| Site | Endereço | Quem usa |
|---|---|---|
| Cliente | `/` | Público: catálogo, pontos de coleta, conta, pontos, recompensas e assistente |
| Funcionário | `/funcionario` | Equipe da central: login próprio, painel, clientes, descartes, pontos e recompensas |

## Rodar
```
npm install
npm start
```

## Acesso do funcionário
Na primeira execução é criado o acesso padrão: **funcionario@gmail.com** / **funcionario123** (em `/funcionario`). Troque a senha antes de publicar.

## Criar outro funcionário ou trocar a senha
O cadastro público só cria **clientes**. Funcionário só é criado por quem administra o servidor:
```
node criar-funcionario.js "Nome Completo" email@exemplo.com "senha-com-8-ou-mais-caracteres"
```
(ou, ao iniciar o servidor, com as variáveis `ECO_STAFF_NOME`, `ECO_STAFF_EMAIL` e `ECO_STAFF_SENHA`).
Rodar o comando de novo com o mesmo e-mail troca a senha.

## Como a separação funciona
- **Arquivos:** o site do cliente fica em `public/` e o do funcionário em `staff/`. O cliente não tem link, texto nem código da área do funcionário.
- **Login:** conta de cliente não entra na central, e conta de funcionário não entra no site do cliente (as duas recebem apenas "E-mail ou senha inválidos").
- **API:** tudo do funcionário fica em `/api/staff/*`. Sem token de funcionário, a resposta é `404`, como se a rota não existisse. Os dados da central (leituras, lixeiras, resumo) saíram das rotas públicas.
- **Sessão:** o token do funcionário dura 8 horas e fica só na aba aberta (`sessionStorage`).
- **Equipamento da lixeira:** continua enviando para `POST /api/leituras`. Para exigir senha do equipamento, defina `ECO_DEVICE_KEY` e envie o mesmo valor no cabeçalho `x-device-key`.

## Recomendações para publicar
Use HTTPS, defina `ECO_SECRET` (segredo das sessões) e escolha uma senha forte para a equipe.
