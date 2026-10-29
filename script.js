const $=s=>document.querySelector(s);
const fmt=n=>n.toFixed(2).replace(".",",");
const CATS=["Papel e papelão","Plástico","Vidro","Metais","Eletrônicos e pilhas","Não reciclável"];
const ITEMS=[
["Garrafa PET","Plástico","Esvazie, enxágue rápido, amasse e tampe.","Rótulo pode ficar."],
["Pote de margarina","Plástico","Retire restos e enxágue.","Só precisa estar sem resíduo de comida."],
["Caixa de papelão","Papel e papelão","Desmonte e mantenha seca.","Papelão engordurado ou molhado não recicla."],
["Caixa de pizza","Papel e papelão","Recicle só a parte limpa; a parte com gordura vai para o lixo comum.","Rasgue e separe."],
["Jornal e revista","Papel e papelão","Mantenha seco e sem restos.","Evite papel molhado ou sujo."],
["Garrafa de vidro","Vidro","Esvazie, enxágue e entregue inteira.","Cacos: embrulhe em papel e identifique."],
["Lata de alumínio","Metais","Esvazie e enxágue; pode amassar.","Aerossóis: confirme a regra do ponto."],
["Lata de aço (conserva)","Metais","Retire restos e enxágue.","Cuidado com a borda cortante."],
["Pilha e bateria","Eletrônicos e pilhas","Nunca no lixo comum. Leve a ponto específico.","Guarde longe de umidade e calor."],
["Celular e carregador","Eletrônicos e pilhas","Apague seus dados e leve a ponto de eletrônicos.","Não desmonte a bateria."],
["Fralda descartável","Não reciclável","Vai para o lixo comum, bem embalada.","Não é reciclável."]];
const PTS=[
{n:"Ponto Campus A",a:"Plástico, Papel e papelão, Metais",x:90,y:70},
{n:"Depósito Verde Centro",a:"Vidro, Metais, Papel e papelão",x:300,y:60},
{n:"Ecoponto Bairro Norte",a:"Eletrônicos e pilhas, Plástico",x:310,y:210},
{n:"Cooperativa Modelo",a:"Plástico, Papel e papelão, Vidro, Metais",x:80,y:215}];

/* catálogo e pontos */
function chips(el,list,get,set,after){el.innerHTML="";["Todas",...list].forEach(c=>{const b=document.createElement("button");b.className="chip"+(c===get()?" on":"");b.textContent=c;b.onclick=()=>{set(c);chips(el,list,get,set,after);after()};el.append(b)})}
let cf="Todas",pf="Todas";
function renderCat(){const q=$("#q").value.toLowerCase().trim();const r=ITEMS.filter(i=>(cf==="Todas"||i[1]===cf)&&(!q||i[0].toLowerCase().includes(q)||i[1].toLowerCase().includes(q)));
$("#items").innerHTML=r.length?r.map(i=>`<div class="card"><h3>${i[0]}</h3><span class="tag">${i[1]}</span><p>${i[2]}</p><p class="mu">${i[3]}</p></div>`).join(""):`<div class="card"><p>Nenhum item para "${q.replace(/</g,"")}". Tente outro nome ou consulte o ponto de coleta local.</p></div>`}
function renderPts(){$("#plist").innerHTML=PTS.filter(p=>pf==="Todas"||p.a.includes(pf)).map(p=>`<div class="card"><h3>${p.n}</h3><span class="tag demo">DEMO</span><p class="mu">Aceita: ${p.a}</p></div>`).join("")||`<div class="card"><p>Nenhum ponto cadastrado aceita esse material.</p></div>`}
chips($("#chips"),CATS,()=>cf,v=>cf=v,renderCat);chips($("#pchips"),CATS.slice(0,5),()=>pf,v=>pf=v,renderPts);
$("#q").oninput=renderCat;renderCat();renderPts();


/* assistente */
function rules(t){const q=t.toLowerCase();
const it=ITEMS.find(i=>q.includes(i[0].toLowerCase().split(" ")[0])&&i[0].toLowerCase().split(" ").some(w=>w.length>3&&q.includes(w)));
if(!it)return"Não encontrei isso no catálogo, então prefiro não inventar uma orientação. Consulte o ponto de coleta local ou tente outro nome.";
if(it[1]==="Não reciclável")return`${it[0]}: ${it[2]}`;
const pts=PTS.filter(p=>p.a.includes(it[1])).map(p=>p.n);
return`${it[0]} (${it[1]}): ${it[2]} ${it[3]} Pontos de demonstração que aceitam: ${pts.join(", ")||"nenhum cadastrado"}. Confirme as regras do ponto.`}
function say(t,c){const d=document.createElement("div");d.className="m "+c;d.textContent=t;$("#chat").append(d);$("#chat").scrollTop=1e5;return d}
let sample=null,busy=false;
const SYS=`Você é a assistente do EcoGuia UNINASSAU. Responda em português, em até 5 frases, só com base nos dados abaixo. Se o dado não existir, diga que não há informação e sugira consultar o ponto de coleta local. Nunca invente endereços, pontos ou leis. Os pontos são fictícios de demonstração e isso deve ser dito ao citá-los. Para perguntas sobre empresas, dê orientação geral de separação por categoria usando o catálogo. Não prometa benefícios fiscais.\nCATÁLOGO: ${JSON.stringify(ITEMS)}\nPONTOS: ${JSON.stringify(PTS.map(p=>({nome:p.n,aceita:p.a})))}`;
async function ask(t){t=t.trim();if(!t||busy)return;busy=true;$("#ask").value="";say(t,"u");const d=say("…","b");
try{if(!sample)throw 0;const r=await sample(SYS+"\nPERGUNTA: "+t,{cache:false,modelTier:"quick",onText:x=>{d.textContent=x.text;$("#chat").scrollTop=1e5}});d.textContent=r.text}
catch(e){d.textContent=rules(t)}busy=false}
$("#send").onclick=()=>ask($("#ask").value);$("#ask").onkeydown=e=>{if(e.key==="Enter")ask(e.target.value)};
document.querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>ask(b.dataset.s));
say("Olá! Sou a assistente do EcoGuia. Pergunte sobre um resíduo.","b");
function aiState(){const ok=!!sample;$("#aiTag").textContent=ok?"IA conectada, limitada ao catálogo":"respostas por regras (IA indisponível aqui)";$("#aiTag").className="tag"+(ok?"":" demo");$("#aiNote").textContent=ok?"Respostas geradas por IA, com base apenas no catálogo e nos pontos de demonstração. Pode pedir consentimento na primeira pergunta.":"Nesta visualização a assistente responde por regras simples do catálogo."}
aiState();
try{claude.use("sample").then(s=>{sample=s;aiState()}).catch(()=>{})}catch(e){}

/* vídeo */
const bin=(x,y,c="")=>`<g transform="translate(${x},${y})"><rect class="gl" x="0" y="0" width="90" height="120" rx="10"/><rect class="gl" x="-6" y="-14" width="102" height="16" rx="4"/>${c}</g>`;
const SC=[
{t:"O problema",c:"Recicláveis acabam no lixo comum por falta de informação.",s:`<g class="a1">${bin(150,200)}${bin(300,200)}${bin(450,200)}</g><g class="a2"><text x="400" y="120" text-anchor="middle" font-size="30">Onde descarto isto?</text></g><g class="a3 pl"><circle cx="400" cy="170" r="6" fill="#ffb454"/></g>`},
{t:"Lixeira inteligente",c:"A célula de carga mede o peso e o HX711 converte o sinal.",s:`<g class="a1">${bin(310,120)}</g><rect class="gl a1" x="296" y="252" width="118" height="12" rx="3"/><g class="a2"><rect class="fill bx" x="334" y="150" width="42" height="90" opacity=".5"/><text x="355" y="215" text-anchor="middle" font-size="14">PET</text></g><g class="a3"><text x="520" y="200" font-size="42" style="fill:#3ddc97">1,35 kg</text><text x="520" y="228" font-size="15" style="fill:#8fa6d1">leitura simulada</text></g>`},
{t:"Microcontrolador e GPS",c:"O ESP32 lê o peso e junta data, hora e localização.",s:`<g class="a1"><rect class="gl" x="100" y="170" width="130" height="90" rx="8"/><text x="165" y="222" text-anchor="middle">HX711</text></g><path class="gl flow" d="M230 215H320"/><g class="a2"><rect class="gl" x="320" y="150" width="160" height="130" rx="10"/><text x="400" y="222" text-anchor="middle" font-size="20">ESP32</text></g><g class="a3"><rect class="gl" x="570" y="100" width="120" height="70" rx="8"/><text x="630" y="142" text-anchor="middle">GPS</text></g><path class="gl flow" d="M570 150L480 190"/>`},
{t:"Transmissão",c:"Os dados seguem por Wi-Fi e internet em formato JSON.",s:`<g class="a1">${bin(60,230)}</g><path class="gl flow" d="M160 270Q400 40 640 270"/><g class="a2"><rect class="gl" x="620" y="230" width="130" height="90" rx="10"/><text x="685" y="282" text-anchor="middle">Central</text></g><g class="a3"><text x="400" y="110" text-anchor="middle" font-size="16" style="fill:#3ddc97">{ peso: 1.35, lixeira: LX-001, hora: ... }</text></g>`},
{t:"Central de informações",c:"A central reúne lixeiras e depósitos e libera os dados por API.",s:`<g class="a1"><circle class="gl" cx="400" cy="225" r="55"/><text x="400" y="231" text-anchor="middle" font-size="18">Central</text></g>${[[130,90],[130,360],[670,90],[670,360]].map(p=>`<path class="gl flow" d="M${p[0]} ${p[1]}L400 225"/><circle class="fill pl" cx="${p[0]}" cy="${p[1]}" r="10"/>`).join("")}<text x="130" y="130" text-anchor="middle" style="fill:#8fa6d1" font-size="14">Lixeiras</text><text x="670" y="130" text-anchor="middle" style="fill:#8fa6d1" font-size="14">Depósitos</text>`},
{t:"Site e aplicativo",c:"A pessoa pergunta e recebe orientação baseada no catálogo e nos pontos.",s:`<g class="a1"><rect class="gl" x="90" y="110" width="330" height="210" rx="10"/><text x="255" y="150" text-anchor="middle">Site: catálogo e painel</text><rect class="fill bx" x="130" y="230" width="30" height="60"/><rect class="fill bx" x="180" y="200" width="30" height="90"/><rect class="fill bx" x="230" y="250" width="30" height="40"/></g><g class="a2"><rect class="gl" x="500" y="90" width="150" height="250" rx="18"/><text x="575" y="130" text-anchor="middle" font-size="14">App</text></g><g class="a3"><rect class="fill" x="515" y="160" width="120" height="44" rx="10" opacity=".25"/><text x="575" y="187" text-anchor="middle" font-size="12">Pode reciclar PET?</text></g><g class="a4"><rect class="gl" x="515" y="220" width="120" height="90" rx="10"/><text x="575" y="250" text-anchor="middle" font-size="12">Enxágue, amasse</text><text x="575" y="270" text-anchor="middle" font-size="12">e leve ao ponto</text></g>`}];
const DUR=5000;let cur=-1,t0=0,playing=false,raf=0,off=0;
function scene(i){cur=i;$("#svg").innerHTML=SC[i].s;$("#cap").innerHTML=`<small>${i+1} de ${SC.length}: ${SC[i].t}</small>${SC[i].c}`}
function tick(ts){const e=ts-t0+off;const i=Math.floor(e/DUR);if(i>=SC.length){off=0;t0=ts;scene(0)}else{if(i!==cur)scene(i);$("#bar i").style.width=(e/(DUR*SC.length)*100)+"%"}raf=requestAnimationFrame(tick)}
function play(){if(playing)return;playing=true;$("#pp").textContent="Pausar";t0=performance.now();raf=requestAnimationFrame(tick)}
function pause(){if(playing)off+=performance.now()-t0;playing=false;cancelAnimationFrame(raf);$("#pp").textContent="Continuar"}
$("#pp").onclick=()=>playing?pause():play();
$("#rs").onclick=()=>{pause();off=0;cur=-1;play()};
scene(0);
let userPaused=false;$("#pp").addEventListener("click",()=>userPaused=!playing);
try{new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){if(!userPaused)play()}else if(playing)pause()})},{threshold:.4}).observe($("#stage"))}catch(e){play()}

/* ===== Integração com o servidor (Node + SQLite) ===== */
const Tok = {
  get() { try { return localStorage.getItem("eco_token"); } catch (e) { return null; } },
  set(v) { try { v ? localStorage.setItem("eco_token", v) : localStorage.removeItem("eco_token"); } catch (e) {} }
};
const API = {
  ok: false,
  async j(url, o = {}) {
    const t = Tok.get();
    const r = await fetch(url, { ...o, headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}), ...o.headers } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.erro || "Não foi possível concluir a operação."), { status: r.status });
    return d;
  }
};
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("on"), 3800); }
let me = null, rewards = [];

/* Carrega catálogo e pontos do banco. Se o servidor estiver desligado, a página segue com os dados embutidos. */
async function hydrate() {
  try {
    const [cat, pts] = await Promise.all([API.j("/api/catalogo"), API.j("/api/pontos")]);
    API.ok = true;
    ITEMS.splice(0, ITEMS.length, ...cat.map(i => [i.nome, i.categoria, i.como, i.dica]));
    PTS.splice(0, PTS.length, ...pts.map(p => ({ id: p.id, n: p.nome, a: p.materiais.map(m => m.categoria).join(", "), m: p.materiais })));
    renderCat(); renderPts();
    await loadMe();
  } catch (e) {
    API.ok = false; renderConta();
  }
}

/* ===== Conta, pontos e recompensas ===== */
async function loadMe() {
  me = null;
  if (API.ok && Tok.get()) {
    try { [me, rewards] = await Promise.all([API.j("/api/me"), API.j("/api/recompensas")]); }
    catch (e) { if (e.status === 401) Tok.set(null); }
  }
  renderConta(); setAcc();
}
function setAcc() {
  $("#accBtn").textContent = me ? `${me.nome.split(" ")[0]} · ${me.saldo} pts` : "Entrar";
  $("#hPts").textContent = me ? `${me.saldo} pts` : "Recicle";
  $("#hSub").textContent = me ? `Olá, ${me.nome.split(" ")[0]}! Esse é o seu saldo de pontos.` : "Entre para guardar seus descartes e acumular pontos.";
}

const tabela = (lista, linha, vazio) => lista.length ? `<table><tbody>${lista.map(linha).join("")}</tbody></table>` : `<p class="mu">${vazio}</p>`;
const dia = s => new Date(String(s).replace(" ", "T") + "Z").toLocaleDateString("pt-BR");

function renderConta() {
  const el = $("#contaOut");
  if (!API.ok) { el.innerHTML = `<h3>Servidor desligado</h3><p class="mu">Inicie o projeto com <code>npm start</code> para criar conta e acumular pontos.</p>`; return; }
  if (!me) {
    el.innerHTML = `<div class="rw"><div><h3>Guarde seus descartes</h3><p class="mu">Cada material entregue em um ponto de coleta gera pontos pelo peso.</p></div><div class="row" style="margin:0"><button class="btn" data-auth="login">Entrar</button><button class="btn alt" data-auth="registro">Criar conta</button></div></div>`;
    return;
  }
  el.innerHTML = `
  <div class="rw" style="padding-top:0"><div><p class="mu">Olá, ${esc(me.nome)}</p><div class="big">${me.saldo} <span class="mu">pontos</span></div></div><button class="btn alt" data-auth="sair">Sair</button></div>
  <div class="two">
    <div><h3>Registrar descarte</h3>
      <label class="fl">Ponto de coleta<select id="dPonto">${PTS.filter(p => p.id).map(p => `<option value="${p.id}">${esc(p.n)}</option>`).join("")}</select></label>
      <label class="fl">Material<select id="dMat"></select></label>
      <label class="fl">Peso em kg<input id="dKg" type="number" min="0.1" max="20" step="0.1" value="1" inputmode="decimal"></label>
      <p class="mu" id="dEst"></p><button class="btn" id="dGo">Registrar descarte</button></div>
    <div><h3>Recompensas</h3>${rewards.map(r => `<div class="rw"><div><b>${esc(r.titulo)}</b><p class="mu">${esc(r.descricao)}</p></div><button class="btn alt" data-rw="${r.id}" ${me.saldo < r.custo ? "disabled" : ""}>${r.custo} pts</button></div>`).join("") || `<p class="mu">Nenhuma recompensa disponível.</p>`}</div>
  </div>
  <div class="two">
    <div><h3>Últimos descartes</h3>${tabela(me.descartes, x => `<tr><td>${dia(x.data)}</td><td>${esc(x.ponto)}</td><td>+${x.pontos} pts</td></tr>`, "Nenhum descarte registrado ainda.")}</div>
    <div><h3>Meus cupons</h3>${tabela(me.resgates, x => `<tr><td><code>${esc(x.codigo)}</code></td><td>${esc(x.titulo)}</td></tr>`, "Nenhum cupom resgatado ainda.")}</div>
  </div>`;
  fillMat();
}
function fillMat() {
  const p = PTS.find(x => String(x.id) === $("#dPonto")?.value);
  if (!p) return;
  $("#dMat").innerHTML = p.m.map(m => `<option value="${m.id}" data-k="${m.pontos_por_quilo}">${esc(m.categoria)} · ${m.pontos_por_quilo} pts/kg</option>`).join("");
  estima();
}
function estima() {
  const o = $("#dMat")?.selectedOptions[0];
  if (o) $("#dEst").textContent = `Estimativa: ${Math.floor((+$("#dKg").value || 0) * +o.dataset.k)} pontos`;
}
$("#contaOut").addEventListener("input", e => { if (e.target.id === "dPonto") fillMat(); else if (e.target.id === "dMat" || e.target.id === "dKg") estima(); });
$("#contaOut").addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.auth === "sair") { Tok.set(null); me = null; renderConta(); setAcc(); return; }
  if (b.dataset.auth) { openAuth(b.dataset.auth); return; }
  try {
    if (b.id === "dGo") {
      const d = await API.j("/api/descartes", { method: "POST", body: JSON.stringify({ id_ponto: +$("#dPonto").value, itens: [{ id_material: +$("#dMat").value, peso_kg: +$("#dKg").value }] }) });
      await loadMe(); toast(`Descarte registrado: +${d.total_pontos_ganhos} pontos.`);
    } else if (b.dataset.rw) {
      const d = await API.j("/api/resgates", { method: "POST", body: JSON.stringify({ id_recompensa: +b.dataset.rw }) });
      await loadMe(); toast(`Cupom ${d.codigo_cupom_gerado} gerado.`);
    }
  } catch (err) {
    toast(err.message);
    if (err.status === 401) { Tok.set(null); me = null; renderConta(); setAcc(); }
  }
});

/* ===== Entrar e criar conta ===== */
let modo = "login";
function openAuth(m) {
  if (!API.ok) { toast("Servidor desligado. Inicie o projeto com npm start."); return; }
  modo = m; const reg = m === "registro";
  $("#dlgT").textContent = reg ? "Criar conta" : "Entrar";
  $("#fNome").parentElement.hidden = !reg; $("#fNome").required = reg;
  $("#fSenha").autocomplete = reg ? "new-password" : "current-password";
  $("#authGo").textContent = reg ? "Criar conta" : "Entrar";
  $("#authSw").textContent = reg ? "Já tenho conta" : "Criar uma conta";
  $("#authErr").textContent = "";
  $("#dlg").showModal();
}
$("#accBtn").onclick = () => me ? $("#conta").scrollIntoView() : openAuth("login");
$("#authSw").onclick = () => openAuth(modo === "registro" ? "login" : "registro");
$("#dlgX").onclick = () => $("#dlg").close();
$("#authForm").onsubmit = async e => {
  e.preventDefault();
  const go = $("#authGo"); go.disabled = true; $("#authErr").textContent = "";
  const email = $("#fEmail").value, senha = $("#fSenha").value;
  try {
    if (modo === "registro") await API.j("/api/usuarios", { method: "POST", body: JSON.stringify({ nome_completo: $("#fNome").value, email, senha }) });
    const d = await API.j("/api/login", { method: "POST", body: JSON.stringify({ email, senha }) });
    Tok.set(d.token); $("#dlg").close(); $("#authForm").reset();
    await loadMe(); toast(`Bem-vindo(a), ${d.nome_completo.split(" ")[0]}!`);
  } catch (err) { $("#authErr").textContent = err.message; }
  go.disabled = false;
};

hydrate();
