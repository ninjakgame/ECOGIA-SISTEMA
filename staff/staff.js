"use strict";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const kg = n => Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kg";
const num = n => Number(n || 0).toLocaleString("pt-BR");
// O SQLite grava "AAAA-MM-DD HH:MM:SS" em UTC; as leituras já vêm em ISO.
const data = s => { if (!s) return null; const d = new Date(String(s).includes("T") ? s : String(s).replace(" ", "T") + "Z"); return isNaN(d) ? null : d; };
const dataHora = s => { const d = data(s); return d ? d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"; };
const hora = s => { const d = data(s); return d ? d.toLocaleTimeString("pt-BR") : "—"; };

/* ---------- sessão (só dura enquanto a aba estiver aberta) ---------- */
const Tok = {
  get() { try { return sessionStorage.getItem("eco_staff"); } catch (e) { return null; } },
  set(v) { try { v ? sessionStorage.setItem("eco_staff", v) : sessionStorage.removeItem("eco_staff"); } catch (e) {} }
};
async function api(url, o = {}) {
  const t = Tok.get();
  const r = await fetch(url, { ...o, headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}), ...o.headers } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    // 404 em /api/staff/* significa sessão ausente ou expirada.
    if (!url.endsWith("/login") && (r.status === 401 || r.status === 404)) { sair("Sessão encerrada. Entre novamente."); throw Object.assign(new Error("sessão"), { silencioso: true }); }
    throw new Error(d.erro || "Não foi possível concluir a operação.");
  }
  return d;
}
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("on"), 3600); }
const falhou = e => { if (!e.silencioso) toast(e.message); };

/* ---------- entrar / sair ---------- */
function mostrar(logado) { $("#gate").hidden = logado; $("#app").hidden = !logado; }
function sair(msg) {
  Tok.set(null); clearInterval(timer); timer = 0;
  mostrar(false); $("#lErr").textContent = msg || ""; $("#lSenha").value = "";
}
$("#sair").onclick = () => sair();
$("#loginForm").onsubmit = async e => {
  e.preventDefault();
  const go = $("#lGo"); go.disabled = true; $("#lErr").textContent = "";
  try {
    const d = await api("/api/staff/login", { method: "POST", body: JSON.stringify({ email: $("#lEmail").value, senha: $("#lSenha").value }) });
    Tok.set(d.token); $("#lSenha").value = "";
    entrar(d.nome_completo);
  } catch (err) { $("#lErr").textContent = err.message; }
  go.disabled = false;
};
function entrar(nome) {
  $("#uNome").textContent = nome || "";
  mostrar(true); abrir("geral");
}

/* ---------- navegação ---------- */
let atual = "", timer = 0, ultimaPorLixeira = {};
$("#tabs").onclick = e => { const b = e.target.closest("button[data-v]"); if (b) abrir(b.dataset.v); };
function abrir(v) {
  atual = v;
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.v === v));
  clearInterval(timer); timer = 0;
  ultimaPorLixeira = {};
  $("#view").innerHTML = `<p class="mu">Carregando…</p>`;
  carregar();
  if (v === "geral" || v === "lixeiras") timer = setInterval(() => { if (!document.hidden) carregar(true); }, 8000);
}
async function carregar(silencioso) {
  const v = atual;
  try {
    const html = await VIEWS[v]();
    if (v === atual) { $("#view").innerHTML = html; if (AFTER[v]) AFTER[v](); }
  } catch (e) { if (!silencioso) falhou(e); if (!silencioso && v === atual) $("#view").innerHTML = `<p class="mu">Não foi possível carregar esta seção.</p>`; }
}

const cabeca = (t, sub, extra = "") => `<div class="head"><div><h2>${t}</h2><p class="mu">${sub}</p></div>${extra}</div>`;
const tabela = (cols, linhas, vazio) => linhas.length
  ? `<div class="tw"><table><thead><tr>${cols.map(c => `<th${c.endsWith("#") ? ' class="num"' : ""}>${c.replace("#", "")}</th>`).join("")}</tr></thead><tbody>${linhas.join("")}</tbody></table></div>`
  : `<p class="empty">${vazio}</p>`;

/* ---------- seções ---------- */
const VIEWS = {
  async geral() {
    const r = await api("/api/staff/resumo");
    const max = Math.max(...r.por_categoria.map(c => c.kg), 1);
    return cabeca("Visão geral", "Resumo da central. Atualiza sozinho a cada poucos segundos.", `<span class="tag">ao vivo</span>`) + `
    <div class="cards">
      <div class="card kpi"><div class="n">${kg(r.total_kg)}</div><div class="l">recebidos das lixeiras</div></div>
      <div class="card kpi"><div class="n">${num(r.leituras)}</div><div class="l">leituras registradas</div></div>
      <div class="card kpi"><div class="n">${num(r.clientes)}</div><div class="l">clientes cadastrados</div></div>
      <div class="card kpi"><div class="n">${num(r.descartes)}</div><div class="l">descartes de clientes (${kg(r.kg_entregues)})</div></div>
      <div class="card kpi"><div class="n">${num(r.pontos_distribuidos)}</div><div class="l">pontos distribuídos</div></div>
      <div class="card kpi"><div class="n">${num(r.resgates)}</div><div class="l">recompensas resgatadas</div></div>
    </div>
    <div class="two">
      <div class="card"><h3>Peso por categoria</h3><div class="bars">${r.por_categoria.length ? r.por_categoria.map(c => `<p><span>${esc(c.categoria)}</span><span>${kg(c.kg)}</span></p><div class="b" style="width:${Math.max(3, c.kg / max * 100)}%"></div>`).join("") : `<p class="empty">Nenhuma leitura ainda.</p>`}</div></div>
      <div class="card"><h3>Últimas leituras</h3>${tabela(["Hora", "Lixeira", "Material", "Peso#"], r.recentes.map(x => `<tr><td>${hora(x.data_hora)}</td><td>${esc(x.id_lixeira)}</td><td>${esc(x.categoria)}</td><td class="num">${kg(x.peso_kg)}</td></tr>`), "Nenhuma leitura ainda.")}</div>
    </div>`;
  },

  async lixeiras() {
    const [lx, pts, leituras] = await Promise.all([api("/api/staff/lixeiras"), api("/api/staff/pontos"), api("/api/staff/leituras?limite=30")]);
    VIEWS._mapa = { lx, pts };
    return cabeca("Lixeiras e leituras", "Equipamentos cadastrados e o que cada um já enviou.") + `
    <div class="two">
      <div class="card"><h3>Mapa esquemático</h3><svg id="map" viewBox="0 0 400 270" role="img" aria-label="Mapa esquemático com lixeiras e pontos de coleta"></svg><p class="mu">Círculos: lixeiras. Quadrados: pontos de coleta (fictícios na demonstração).</p></div>
      <div class="card"><h3>Lixeiras</h3>${tabela(["Lixeira", "Material", "Total#", "Última"], lx.map(l => `<tr><td>${esc(l.id)}</td><td>${esc(l.categoria)}</td><td class="num">${kg(l.total_kg)}</td><td>${dataHora(l.ultima)}</td></tr>`), "Nenhuma lixeira cadastrada.")}
        <h3 style="margin-top:16px">Simular leitura</h3>
        <p class="mu">Para demonstração, sem o equipamento. A leitura fica marcada como simulada.</p>
        <div class="row"><label class="fl" style="margin:0">Lixeira<select id="sLx">${lx.map(l => `<option value="${esc(l.id)}">${esc(l.id)} · ${esc(l.categoria)}</option>`).join("")}</select></label>
        <label class="fl" style="margin:0">Peso (kg)<input id="sKg" type="number" min="0.1" max="200" step="0.05" value="1.2" inputmode="decimal"></label>
        <button class="btn" id="sGo" type="button">Registrar</button></div></div>
    </div>
    <div class="card"><h3>Leituras recentes</h3>${tabela(["Data e hora", "Lixeira", "Material", "Peso#", "Origem"], leituras.map(x => `<tr><td>${dataHora(x.data_hora)}</td><td>${esc(x.id_lixeira)}</td><td>${esc(x.categoria)}</td><td class="num">${kg(x.peso_kg)}</td><td>${x.simulado ? `<span class="tag warn">simulada</span>` : `<span class="tag">equipamento</span>`}</td></tr>`), "Nenhuma leitura ainda.")}</div>`;
  },

  async clientes() {
    const c = await api("/api/staff/clientes");
    VIEWS._clientes = c;
    return cabeca("Clientes", `${num(c.length)} conta(s) de cliente. Somente leitura.`) +
      `<div class="card"><label class="fl" style="margin:0 0 10px">Buscar por nome ou e-mail<input id="cBusca" type="search" placeholder="Digite para filtrar" autocomplete="off"></label><div id="cTab"></div></div>`;
  },

  async descartes() {
    const d = await api("/api/staff/descartes?limite=100");
    return cabeca("Descartes", "Registros feitos pelos clientes em pontos de coleta (últimos 100).") +
      `<div class="card">${tabela(["Data", "Cliente", "Ponto", "Material", "Peso#", "Pontos#"], d.map(x => `<tr><td>${dataHora(x.data)}</td><td>${esc(x.cliente)}</td><td>${esc(x.ponto)}</td><td>${esc(x.materiais)}</td><td class="num">${kg(x.kg)}</td><td class="num">+${num(x.pontos)}</td></tr>`), "Nenhum descarte registrado ainda.")}</div>`;
  },

  async pontos() {
    const p = await api("/api/staff/pontos");
    return cabeca("Pontos de coleta", "Pontos inativos deixam de aparecer para os clientes.") +
      `<div class="pgrid">${p.map(x => `<div class="card"><div class="top"><h3>${esc(x.nome)}</h3><span class="tag ${x.status === "ativo" ? "" : "off"}">${esc(x.status)}</span></div>
        <p class="mu">Aceita: ${esc(x.materiais.join(", ") || "—")}</p>
        <button class="btn alt sm" data-ponto="${x.id}" data-st="${x.status === "ativo" ? "inativo" : "ativo"}" type="button">${x.status === "ativo" ? "Desativar" : "Ativar"}</button></div>`).join("") || `<p class="empty">Nenhum ponto cadastrado.</p>`}</div>`;
  },

  async recompensas() {
    const [r, g] = await Promise.all([api("/api/staff/recompensas"), api("/api/staff/resgates?limite=50")]);
    return cabeca("Recompensas", "Ajuste o custo em pontos e o estoque. Recompensa sem estoque some para os clientes.") + `
    <div class="card" style="margin-bottom:14px">${tabela(["Recompensa", "Custo (pts)", "Estoque", ""], r.map(x => `<tr><td><b>${esc(x.titulo)}</b><div class="mu">${esc(x.descricao)}</div></td>
      <td><input type="number" min="0" step="1" value="${x.custo}" data-f="custo" data-id="${x.id}" aria-label="Custo de ${esc(x.titulo)}"></td>
      <td><input type="number" min="0" step="1" value="${x.estoque}" data-f="estoque" data-id="${x.id}" aria-label="Estoque de ${esc(x.titulo)}"></td>
      <td><button class="btn alt sm" data-salvar="${x.id}" type="button">Salvar</button></td></tr>`), "Nenhuma recompensa cadastrada.")}</div>
    <div class="card"><h3>Cupons resgatados</h3>${tabela(["Data", "Cliente", "Recompensa", "Cupom"], g.map(x => `<tr><td>${dataHora(x.data)}</td><td>${esc(x.cliente)}</td><td>${esc(x.titulo)}</td><td><code>${esc(x.codigo)}</code></td></tr>`), "Nenhum cupom resgatado ainda.")}</div>`;
  }
};

/* ---------- depois de desenhar cada seção ---------- */
const AFTER = {
  lixeiras() {
    const { lx, pts } = VIEWS._mapa;
    let s = `<path d="M0 135H400M200 0V270M60 0L340 270" stroke="#1d3566" stroke-width="6" fill="none"/>`;
    pts.forEach(p => { if (p.x == null) return; s += `<g opacity="${p.status === "ativo" ? 1 : .35}"><rect x="${p.x - 9}" y="${p.y - 9}" width="18" height="18" rx="3" fill="#ffb454"/><text x="${p.x}" y="${p.y + 26}" text-anchor="middle" font-size="10" fill="#8fa6d1">${esc(p.nome.split(" ").slice(0, 2).join(" "))}</text></g>`; });
    lx.forEach(b => { if (b.x == null) return; s += `<g id="b-${esc(b.id)}"><circle cx="${b.x}" cy="${b.y}" r="8" fill="#3ddc97"/><text x="${b.x}" y="${b.y - 13}" text-anchor="middle" font-size="10" fill="#e9f0ff">${esc(b.id)}</text></g>`; });
    $("#map").innerHTML = s;
    // Pulso nas lixeiras que receberam leitura desde a última atualização.
    lx.forEach(b => {
      if (ultimaPorLixeira[b.id] && ultimaPorLixeira[b.id] !== b.ultima) {
        const g = document.getElementById("b-" + b.id); if (!g) return;
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", b.x); c.setAttribute("cy", b.y); c.setAttribute("class", "ping"); g.append(c);
        setTimeout(() => c.remove(), 1300);
      }
      ultimaPorLixeira[b.id] = b.ultima || "-";
    });
  },
  clientes() {
    const desenha = () => {
      const q = ($("#cBusca").value || "").toLowerCase().trim();
      const l = VIEWS._clientes.filter(c => !q || c.nome.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
      $("#cTab").innerHTML = tabela(["Nome", "E-mail", "Cadastro", "Descartes#", "Peso#", "Saldo#"],
        l.map(c => `<tr><td>${esc(c.nome)}</td><td>${esc(c.email)}</td><td>${dataHora(c.cadastro)}</td><td class="num">${num(c.descartes)}</td><td class="num">${kg(c.kg)}</td><td class="num">${num(c.saldo)} pts</td></tr>`),
        q ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado ainda.");
    };
    $("#cBusca").oninput = desenha; desenha();
  }
};

/* ---------- ações ---------- */
$("#view").addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  try {
    if (b.id === "sGo") {
      b.disabled = true;
      await api("/api/staff/leituras", { method: "POST", body: JSON.stringify({ id_lixeira: $("#sLx").value, peso_kg: +$("#sKg").value }) });
      toast("Leitura registrada."); await carregar(true);
    } else if (b.dataset.ponto) {
      await api("/api/staff/pontos/" + b.dataset.ponto, { method: "PATCH", body: JSON.stringify({ status: b.dataset.st }) });
      toast("Ponto atualizado."); await carregar(true);
    } else if (b.dataset.salvar) {
      const id = b.dataset.salvar;
      const v = f => +document.querySelector(`input[data-f="${f}"][data-id="${id}"]`).value;
      await api("/api/staff/recompensas/" + id, { method: "PATCH", body: JSON.stringify({ custo: v("custo"), estoque: v("estoque") }) });
      toast("Recompensa salva.");
    }
  } catch (err) { falhou(err); }
  if (b.id === "sGo") b.disabled = false;
});

/* ---------- início: retoma a sessão se a aba ainda tiver token válido ---------- */
(async () => {
  if (!Tok.get()) return mostrar(false);
  try { const me = await api("/api/staff/me"); entrar(me.nome); } catch (e) { mostrar(false); }
})();
