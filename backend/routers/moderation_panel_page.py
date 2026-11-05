"""Pagina del pannello di moderazione: una sola pagina, nessun dato dentro. Il testo degli utenti entra solo con textContent."""

PANEL_HTML = """<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Moderazione - Scambio Favori</title>
<style>
:root{--bg:#0C0E09;--card:#171A10;--line:#2E3420;--olive:#98AA4A;--orange:#F87828;--text:#fff;--muted:#A5A89B}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 -apple-system,Segoe UI,sans-serif;padding:16px;max-width:820px;margin:0 auto}
h1{font-size:20px;margin:6px 0 14px}.box{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px}
input,textarea{width:100%;background:#0C0E09;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:10px;font:inherit}
button{background:var(--orange);color:#0C0E09;border:0;border-radius:8px;padding:9px 12px;font:inherit;font-weight:700;cursor:pointer}
button.ghost{background:#23281A;color:var(--text)}button.olive{background:var(--olive)}button:disabled{opacity:.5}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.tabs{display:flex;gap:8px;margin-bottom:12px}
.badge{display:inline-block;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:700;background:#23281A;color:var(--muted)}
.badge.high{background:var(--orange);color:#0C0E09}.badge.hold{background:#6B7A38;color:#fff}
.meta{color:var(--muted);font-size:13px}.quote{border-left:3px solid var(--olive);padding:6px 10px;margin:8px 0;white-space:pre-wrap;word-break:break-word}
.err{color:var(--orange)}.hidden{display:none}small{color:var(--muted)}
</style></head><body>
<h1>Moderazione · Scambio Favori</h1>
<div id="login" class="box">
  <p>Scrivi il tuo codice di moderazione. Resta solo in questa scheda e si cancella quando la chiudi.</p>
  <input id="token" type="password" autocomplete="off" placeholder="Codice di moderazione">
  <div class="row"><button id="enter">Entra</button></div><p id="loginError" class="err"></p>
</div>
<div id="app" class="hidden">
  <div class="tabs"><button class="olive" id="tabReports">Segnalazioni</button><button class="ghost" id="tabHeld">Account in revisione</button>
    <button class="ghost" id="refresh">Aggiorna</button><button class="ghost" id="logout">Esci</button></div>
  <p class="meta"><label><input id="showAll" type="checkbox" style="width:auto"> Mostra anche quelle già gestite</label></p>
  <div id="list"></div>
</div>
<script>
"use strict";
var KEY="moderation_token", view="reports";
function $(id){return document.getElementById(id)}
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined&&text!==null)e.textContent=text;return e}
function token(){return sessionStorage.getItem(KEY)||""}
function api(path,opts){opts=opts||{};opts.headers=Object.assign({"X-Moderation-Token":token(),"Content-Type":"application/json"},opts.headers||{});
  return fetch("/api/admin/moderation"+path,opts).then(function(r){return r.json().catch(function(){return{}}).then(function(b){if(!r.ok)throw new Error(b.detail||("Errore "+r.status));return b})})}
function when(iso){var d=new Date(iso);return isNaN(d)?"":d.toLocaleString("it-IT",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}
var REASONS={safety_alert:"Allarme di sicurezza",offensive:"Offensivo",spam:"Spam",fraud:"Truffa",inappropriate:"Inappropriato",fake_profile:"Profilo falso",money_request:"Chiede soldi",other:"Altro"};
function reason(r){return REASONS[r]||r||"Non specificato"}

function actionBtn(label,action,id,cls,note,done){var b=el("button",cls,label);b.onclick=function(){
  if(action==="release_user"&&!confirm("Sbloccare questo account?"))return;
  b.disabled=true;api("/reports/"+encodeURIComponent(id)+"/action",{method:"POST",body:JSON.stringify({action:action,note:note.value||null})})
   .then(done).catch(function(e){b.disabled=false;alert(e.message)})};return b}

function card(r,done){var c=el("div","box");
  var head=el("div");if(r.priority==="high")head.appendChild(el("span","badge high","URGENTE"));
  head.appendChild(document.createTextNode(" "));head.appendChild(el("span","badge",reason(r.reason)));
  if(r.status!=="pending"){head.appendChild(document.createTextNode(" "));head.appendChild(el("span","badge","gestita: "+r.status))}
  if(r.reported_user&&r.reported_user.safety_hold){head.appendChild(document.createTextNode(" "));head.appendChild(el("span","badge hold","in revisione"))}
  c.appendChild(head);
  c.appendChild(el("p","meta",r.target.kind+" · segnalato da "+r.reporter_name+" · "+when(r.created_at)));
  c.appendChild(el("div","quote",r.target.summary));
  if(r.description)c.appendChild(el("p",null,"Nota di chi ha segnalato: "+r.description));
  if(r.reported_user)c.appendChild(el("p","meta","Persona coinvolta: "+r.reported_user.name+" · segnalazioni totali su di lei/lui: "+r.reported_user.reports_total));
  if(r.status==="pending"){
    var note=el("textarea");note.rows=2;note.placeholder="Nota per te (facoltativa)";note.maxLength=500;c.appendChild(note);
    var row=el("div","row");
    row.appendChild(actionBtn("Archivia","dismiss",r.report_id,"ghost",note,done));
    if(["Messaggio del quartiere","Avviso del quartiere","Evento del quartiere","Presentazione","Favore"].indexOf(r.target.kind)>=0)
      row.appendChild(actionBtn("Nascondi il contenuto","hide_content",r.report_id,"",note,done));
    if(r.reported_user&&!r.reported_user.safety_hold)row.appendChild(actionBtn("Metti in revisione l'account","hold_user",r.report_id,"",note,done));
    if(r.reported_user&&r.reported_user.safety_hold)row.appendChild(actionBtn("Sblocca l'account","release_user",r.report_id,"olive",note,done));
    c.appendChild(row)}
  return c}

function render(){var list=$("list");list.textContent="";list.appendChild(el("p","meta","Carico..."));
  var path=view==="reports"?"/reports?status="+($("showAll").checked?"all":"pending"):"/held-users";
  api(path).then(function(data){list.textContent="";
    if(view==="reports"){if(!data.reports.length)list.appendChild(el("p","meta","Nessuna segnalazione da gestire."));
      data.reports.forEach(function(r){list.appendChild(card(r,render))})}
    else{if(!data.users.length)list.appendChild(el("p","meta","Nessun account in revisione."));
      data.users.forEach(function(u){var c=el("div","box");c.appendChild(el("strong",null,u.name||u.user_id));
        c.appendChild(el("p","meta","Allarmi di sicurezza ricevuti: "+u.alerts+(u.held_at?" · dal "+when(u.held_at):"")));
        c.appendChild(el("p","meta","Per sbloccarlo apri una sua segnalazione in «Segnalazioni» (con «Mostra anche quelle già gestite») e scegli «Sblocca l'account»."));list.appendChild(c)})}
  }).catch(function(e){list.textContent="";var p=el("p","err",e.message);list.appendChild(p);if(/autorizzato/i.test(e.message))logout()})}

function show(on){$("login").classList.toggle("hidden",on);$("app").classList.toggle("hidden",!on)}
function logout(){sessionStorage.removeItem(KEY);show(false)}
$("enter").onclick=function(){var t=$("token").value.trim();$("loginError").textContent="";if(!t)return;
  sessionStorage.setItem(KEY,t);$("token").value="";
  api("/held-users").then(function(){show(true);render()}).catch(function(e){sessionStorage.removeItem(KEY);$("loginError").textContent=e.message})};
$("token").onkeydown=function(e){if(e.key==="Enter")$("enter").onclick()};
$("tabReports").onclick=function(){view="reports";$("tabReports").className="olive";$("tabHeld").className="ghost";render()};
$("tabHeld").onclick=function(){view="held";$("tabHeld").className="olive";$("tabReports").className="ghost";render()};
$("refresh").onclick=render;$("logout").onclick=logout;$("showAll").onchange=render;
if(token()){show(true);render()}
</script></body></html>
"""
