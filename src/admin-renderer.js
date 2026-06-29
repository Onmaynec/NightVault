const $ = (s) => document.querySelector(s);
let state = { logged: false, tab: "testing", status: null, logs: [], tables: [], table: "users", rows: [], loadedTable: "", loadingTable: false, loadSeq: 0, lastError: "", dbQuery: "", tableLimit: 100, tableSeqText: "" };
function h(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"})[m]);}
function toast(text){const el=document.createElement('div');el.className='toast';el.textContent=text;document.body.appendChild(el);setTimeout(()=>el.remove(),2800)}
function debounce(fn, wait=120){let timer=null;return (...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),wait)}}
function rowFingerprint(rows){return String((rows||[]).length)+':'+String(Object.keys((rows||[])[0]||{}).join(','))}
function titlebar(){return `<div class="titlebar"><div class="brand"><span class="dot"></span><span>NightVault Server Admin</span><em>1.3.6</em></div><div class="win"><button id="min">−</button><button id="max">▢</button><button id="close">×</button></div></div>`}
function bindWin(){ $('#min')?.addEventListener('click',()=>nvAdmin.minimize()); $('#max')?.addEventListener('click',()=>nvAdmin.toggleFull()); $('#close')?.addEventListener('click',()=>nvAdmin.close()); }
function renderLogin(){app.innerHTML=titlebar()+`<div class="login"><div class="loginBox"><div class="orb" style="width:64px;height:64px;margin-bottom:16px"></div><h1>Вход администратора</h1><p>Запуск сервера, консоль, логи, тесты и read-only просмотр SQLite.</p><input id="u" class="field" placeholder="Логин" value="admin"><input id="p" class="field" type="password" placeholder="Пароль"><button class="btn" id="login">Войти</button><p class="muted">Пароль хранится как PBKDF2-SHA256 hash в пользовательской директории приложения.</p></div></div>`;bindWin();$('#login').onclick=login;$('#p').addEventListener('keydown',e=>{if(e.key==='Enter')login()});}
async function login(){const res=await nvAdmin.login({username:$('#u').value,password:$('#p').value});if(!res.ok)return toast(res.message||'Ошибка входа');state.logged=true;await refreshStatus();render();}
async function refreshStatus(){try{state.status=await nvAdmin.status(); if(state.logged){state.logs=await nvAdmin.logs().catch(()=>[]); state.tables=await nvAdmin.dbTables().catch(()=>[]);}}catch(e){}}
function navButton(id,icon,text){return `<button class="${state.tab===id?'active':''}" onclick="switchAdminTab('${id}')">${icon} <span>${text}</span></button>`}
function switchAdminTab(id){state.tab=id;state.lastError="";render();}
function layout(content){const st=state.status?.server||{};app.innerHTML=titlebar()+`<div class="app"><nav class="nav"><div class="serverCard"><b>Сервер</b><p class="muted">${h(st.url||state.status?.url||'не запущен')}</p><span class="pill ${st.ok?'ok':'warn'}">${st.ok?'● online':'○ offline'}</span></div>${navButton('testing','🧪','Тестирование')}${navButton('console','⌁','Консоль')}${navButton('logs','📜','Логи')}${navButton('data','🗄','Данные')}${navButton('settings','⚙️','Админ')}</nav><main class="content">${content}</main></div>`;bindWin();}
function render(){try{if(!state.logged)return renderLogin(); if(state.tab==='console')return renderConsole(); if(state.tab==='logs')return renderLogs(); if(state.tab==='data')return renderData(); if(state.tab==='settings')return renderSettings(); return renderTesting();}catch(e){console.error(e);app.innerHTML=titlebar()+`<div class="app"><main class="content"><section class="panel"><h2>Ошибка отрисовки</h2><p class="muted">${h(e.message||e)}</p><button class="btn" onclick="render()">Повторить</button></section></main></div>`;bindWin();}}
function renderTesting(){const st=state.status?.server||{};layout(`<section class="panel"><div class="panelHead"><div><h2>Тестирование протоколов</h2><p class="muted">SQLite / E2EE / sync engine / API / порты / логи.</p></div><div class="rowActions"><button class="btn" id="start">Запустить сервер</button><button class="btn ghost" id="stop">Остановить</button></div></div><div class="grid">${test('sqlite','SQLite','Integrity check и файл БД')}${test('e2ee','E2EE','Ключи устройств и конверты')}${test('sync','Sync engine','Pull/push и очередь')}${test('server','API server','Health endpoint')}${test('ports','Порты','3000 + fallback')}${test('logs','Логи','Буфер консоли')}</div><div id="result" class="testResult">Статус: ${h(st.message||'ожидание')}</div></section>`);$('#start').onclick=async()=>{const r=await nvAdmin.startServer();toast(r.message);await refreshStatus();renderTesting();};$('#stop').onclick=async()=>{const r=await nvAdmin.stopServer();toast(r.message);await refreshStatus();renderTesting();};}
function test(id,title,desc){return `<button class="btn ghost testBtn" onclick="runTest('${id}')"><b>${title}</b><span class="muted">${desc}</span></button>`}
async function runTest(id){const out=$('#result');try{if(out)out.textContent='Выполняю тест '+id+'…';const r=await nvAdmin.runTest(id);if(out)out.textContent=JSON.stringify(r,null,2);await refreshStatus();}catch(e){if(out)out.textContent='Ошибка теста: '+(e.message||e);toast('Тест не выполнен: '+(e.message||e));}}
function renderConsole(){layout(`<section class="panel"><div class="panelHead"><div><h2>Консоль сервера</h2><p class="muted">Живой вывод stdout/stderr встроенного сервера.</p></div><button class="btn ghost" id="refresh">Обновить</button></div><div class="console" id="console">${state.logs.map(logLine).join('')}</div></section>`);$('#refresh').onclick=async()=>{await refreshStatus();renderConsole();};setTimeout(()=>{$('#console')?.scrollTo(0,999999)},0)}
function renderLogs(){renderConsole()}
function logLine(l){return `<div class="log ${h(l.level)}"><span class="time">${h(l.time)}</span> [${h(l.level)}] ${h(l.text)}</div>`}
function safeCell(value){
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text == null) text = '';
  text = String(text);
  return text.length > 420 ? text.slice(0, 420) + '…' : text;
}
async function selectTable(name){
  if (!name) return;
  const seq = ++state.loadSeq;
  state.table = name;
  state.loadingTable = true;
  state.lastError = "";
  state.rows = [];
  state.tableSeqText = "";
  renderData();
  try{
    const baseLimit = Number(state.tableLimit || 100);
    const limit = name === 'reputation' ? Math.min(baseLimit, 50) : Math.min(Math.max(baseLimit, 25), 500);
    const rows = await nvAdmin.dbRead(name, limit);
    if (seq !== state.loadSeq) return;
    state.rows = Array.isArray(rows) ? rows : [];
    state.loadedTable = name;
    state.tableSeqText = rowFingerprint(state.rows);
  }catch(e){
    if (seq !== state.loadSeq) return;
    state.rows = [];
    state.lastError = e.message || String(e);
    toast('Таблица не открылась: ' + state.lastError);
  }finally{
    if (seq === state.loadSeq) {
      state.loadingTable = false;
      renderData();
    }
  }
}
function renderTableBody(){
  const allRows=Array.isArray(state.rows)?state.rows:[];
  const q=String(state.dbQuery||'').toLowerCase();
  const rows=q?allRows.filter(r=>JSON.stringify(r||{}).toLowerCase().includes(q)):allRows;
  const cols=[...new Set(rows.flatMap(r=>Object.keys(r||{})))].slice(0,12);
  const notice = state.table === 'reputation' ? '<div class="dbNotice">Таблица reputation открывается в безопасном preview-режиме: максимум 50 строк, длинные JSON-поля обрезаны до предпросмотра.</div>' : '';
  const body = state.loadingTable
    ? '<div class="emptyTable"><span class="miniLoader"></span> Загрузка таблицы…</div>'
    : state.lastError
      ? `<div class="emptyTable errorBox">${h(state.lastError)}</div>`
      : rows.length
        ? `${notice}<table><thead><tr>${cols.map(c=>`<th>${h(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>{const v=safeCell((r||{})[c]);return `<td title="${h(v)}">${h(v)}</td>`}).join('')}</tr>`).join('')}</tbody></table>`
        : '<div class="emptyTable">В таблице нет записей.</div>';
  return { body, rows, allRows };
}
function renderData(){
  if(state.tables.length && !state.tables.includes(state.table)) state.table=state.tables[0];
  const buttons=state.tables.map(t=>`<button class="${state.table===t?'active':''}" onclick="selectTable('${h(t)}')" title="${h(t)}">${h(t)}</button>`).join('');
  const rendered=renderTableBody();
  const limits=[25,50,100,200,500].map(n=>`<option value="${n}" ${Number(state.tableLimit)===n?'selected':''}>${n} строк</option>`).join('');
  layout(`<section class="panel"><div class="panelHead"><div><h2>Данные SQLite</h2><p class="muted">Read-only просмотр таблиц. В 1.3.6 добавлены лимит строк, фильтр без зависания и безопасный preview тяжёлых данных.</p></div><div class="rowActions"><button class="btn ghost" id="reload">Обновить</button></div></div><div class="dataLayout"><div class="tables">${buttons||'<p class="muted">Нет таблиц</p>'}</div><div class="dbMain"><div class="tableToolbar"><input id="dbSearch" class="field" placeholder="Фильтр по загруженным строкам" value="${h(state.dbQuery||'')}"><select id="dbLimit" class="field slim">${limits}</select><span class="muted">${rendered.rows.length}/${rendered.allRows.length} строк</span></div><div class="tableWrap">${rendered.body}</div></div></div></section>`);
  $('#reload').onclick=async()=>{state.loadedTable=''; await refreshStatus(); if(state.table) await selectTable(state.table); else renderData();};
  const search=$('#dbSearch'); if(search) search.oninput=debounce((e)=>{state.dbQuery=e.target.value;renderData();},90);
  const limit=$('#dbLimit'); if(limit) limit.onchange=async(e)=>{state.tableLimit=Number(e.target.value||100); state.loadedTable=''; await selectTable(state.table);};
  if(state.table && state.loadedTable!==state.table && !state.loadingTable){setTimeout(()=>selectTable(state.table).catch(()=>{}),30);}
}
function renderSettings(){layout(`<section class="panel settingsForm"><h2>Администратор</h2><p class="muted">Смена постоянного пароля admin.</p><input id="old" class="field" type="password" placeholder="Текущий пароль"><input id="next" class="field" type="password" placeholder="Новый пароль"><button class="btn" id="chg">Сменить пароль</button></section>`);$('#chg').onclick=async()=>{try{await nvAdmin.changePassword({currentPassword:$('#old').value,nextPassword:$('#next').value});toast('Пароль администратора изменён');}catch(e){toast(e.message)}}}


/* NightVault 1.3.6 Server Admin Pro overlay */
function titlebar(){return `<div class="titlebar"><div class="brand"><span class="dot"></span><span>NightVault Server Admin</span><em>1.3.6</em></div><div class="win"><button id="min">−</button><button id="max">▢</button><button id="close">×</button></div></div>`}
function navButton(id,icon,text){return `<button class="${state.tab===id?'active':''}" onclick="switchAdminTab('${id}')">${icon} <span>${text}</span></button>`}
function layout(content){const st=state.status?.server||{};app.innerHTML=titlebar()+`<div class="app"><nav class="nav"><div class="serverCard"><b>Сервер</b><p class="muted">${h(st.url||state.status?.url||'не запущен')}</p><span class="pill ${st.ok?'ok':'warn'}">${st.ok?'● online':'○ offline'}</span></div>${navButton('dashboard','📊','Dashboard')}${navButton('testing','🧪','Тестирование')}${navButton('console','⌁','Консоль')}${navButton('logs','📜','Логи')}${navButton('data','🗄','Данные')}${navButton('settings','⚙️','Админ')}</nav><main class="content">${content}</main></div>`;bindWin();}
function render(){try{if(!state.logged)return renderLogin(); if(state.tab==='dashboard')return renderDashboard(); if(state.tab==='console')return renderConsole(); if(state.tab==='logs')return renderLogs(); if(state.tab==='data')return renderData(); if(state.tab==='settings')return renderSettings(); return renderTesting();}catch(e){console.error(e);app.innerHTML=titlebar()+`<div class="app"><main class="content"><section class="panel"><h2>Ошибка отрисовки</h2><p class="muted">${h(e.message||e)}</p><button class="btn" onclick="render()">Повторить</button></section></main></div>`;bindWin();}}
function renderDashboard(){const st=state.status?.server||{}; const rows=(state.tables||[]).length; layout(`<section class="panel"><div class=panelHead><div><h2>Dashboard сервера</h2><p class=muted>Статус runtime, SQLite, uptime, таблицы и инструменты тестера.</p></div><div class=rowActions><button class=btn id=start>Запустить</button><button class="btn ghost" id=restart>Перезапустить</button><button class="btn danger" id=stop>Остановить</button></div></div><div class=adminStats><div><b>${st.ok?'Online':'Offline'}</b><span>сервер</span></div><div><b>${h(st.url||state.status?.url||'—')}</b><span>адрес</span></div><div><b>${rows}</b><span>таблиц SQLite</span></div><div><b>${state.logs.length}</b><span>строк логов</span></div></div><div class=buttonRow><button class="btn ghost" onclick="switchAdminTab('testing')">Открыть тесты</button><button class="btn ghost" onclick="switchAdminTab('data')">Открыть БД</button><button class="btn ghost" onclick="switchAdminTab('console')">Открыть консоль</button></div></section>`); $('#start').onclick=async()=>{const r=await nvAdmin.startServer();toast(r.message);await refreshStatus();renderDashboard();}; $('#stop').onclick=async()=>{const r=await nvAdmin.stopServer();toast(r.message);await refreshStatus();renderDashboard();}; $('#restart').onclick=async()=>{await nvAdmin.stopServer().catch(()=>{}); const r=await nvAdmin.startServer();toast(r.message);await refreshStatus();renderDashboard();};}
function renderTesting(){const st=state.status?.server||{};layout(`<section class="panel"><div class="panelHead"><div><h2>Тестирование Mega Release</h2><p class="muted">SQLite / E2EE / sync engine / API / WebSocket / файлы / админ / renderer / нагрузка.</p></div><div class="rowActions"><button class="btn" id="start">Запустить сервер</button><button class="btn ghost" id="stop">Остановить</button><button class="btn ghost" id="allTests">Все тесты</button></div></div><div class="grid">${['sqlite','e2ee','sync','server','ports','logs','files','websocket','admin-auth','db-integrity','renderer','load'].map(id=>test(id,id.toUpperCase(),adminTestDesc(id))).join('')}</div><div id="result" class="testResult">Статус: ${h(st.message||'ожидание')}</div></section>`);$('#start').onclick=async()=>{const r=await nvAdmin.startServer();toast(r.message);await refreshStatus();renderTesting();};$('#stop').onclick=async()=>{const r=await nvAdmin.stopServer();toast(r.message);await refreshStatus();renderTesting();};$('#allTests').onclick=runAllTests;}
function adminTestDesc(id){return ({sqlite:'Integrity и файл БД',e2ee:'ключи устройств',sync:'pull/push и очередь',server:'health endpoint',ports:'3000 + fallback',logs:'буфер консоли',files:'uploads и policy',websocket:'live updates', 'admin-auth':'логин и IPC', 'db-integrity':'таблицы и read-only', renderer:'CSP/render safety', load:'малый load smoke'}[id]||'test')}
async function runAllTests(){const out=$('#result'); const ids=['sqlite','e2ee','sync','server','ports','logs','files','websocket','admin-auth','db-integrity','renderer','load']; const results=[]; for(const id of ids){try{out.textContent='Выполняю '+id+'…\n'+JSON.stringify(results,null,2); results.push(await nvAdmin.runTest(id));}catch(e){results.push({name:id,passed:false,error:e.message||String(e)})}} out.textContent=JSON.stringify(results,null,2); await refreshStatus();}
function renderLogs(){layout(`<section class="panel"><div class=panelHead><div><h2>Логи</h2><p class=muted>Фильтр, export и live output сервера.</p></div><div class=rowActions><select id=logLevel class=field><option value="">Все</option><option>info</option><option>warn</option><option>error</option></select><button class="btn ghost" id=copyLogs>Копировать</button><button class="btn ghost" id=refresh>Обновить</button></div></div><div class="console" id="console"></div></section>`); const draw=()=>{const level=$('#logLevel')?.value||''; const logs=level?state.logs.filter(x=>x.level===level):state.logs; $('#console').innerHTML=logs.map(logLine).join(''); $('#console')?.scrollTo(0,999999)}; $('#logLevel').onchange=draw; $('#refresh').onclick=async()=>{await refreshStatus();renderLogs();}; $('#copyLogs').onclick=()=>navigator.clipboard?.writeText(state.logs.map(x=>`[${x.time}] [${x.level}] ${x.text}`).join('\n')); draw();}
function renderSettings(){layout(`<section class="panel settingsForm"><h2>Администратор</h2><p class="muted">Постоянный admin, PBKDF2-SHA256, версия 1.3.6.</p><input id="old" class="field" type="password" placeholder="Текущий пароль"><input id="next" class="field" type="password" placeholder="Новый пароль"><button class="btn" id="chg">Сменить пароль</button><div class=securityCard>Логин: admin<br>IPC: trusted file renderer only<br>БД: read-only preview</div></section>`);$('#chg').onclick=async()=>{try{await nvAdmin.changePassword({currentPassword:$('#old').value,nextPassword:$('#next').value});toast('Пароль администратора изменён');}catch(e){toast(e.message)}}}


/* NightVault 1.3.6 Admin Test Center: real tests, sync queue tables, debug ZIP. */
function nv130TestIds(){return ['sqlite','e2ee','sync','server','api','files','websocket','admin-auth','db-integrity','renderer','load','ports','logs'];}
function renderDashboard(){const st=state.status?.server||{}; const rows=(state.tables||[]).length; layout(`<section class="panel"><div class=panelHead><div><h2>Dashboard 1.3.6</h2><p class=muted>Sync Engine 2.0, миграции SQLite, trust model, media pipeline и Debug ZIP.</p></div><div class=rowActions><button class=btn id=start>Запустить</button><button class="btn ghost" id=restart>Перезапустить</button><button class="btn danger" id=stop>Остановить</button></div></div><div class=adminStats><div><b>${st.ok?'Online':'Offline'}</b><span>сервер</span></div><div><b>${h(st.url||state.status?.url||'—')}</b><span>адрес</span></div><div><b>${rows}</b><span>таблиц SQLite</span></div><div><b>${state.logs.length}</b><span>строк логов</span></div></div><div class=buttonRow><button class="btn ghost" onclick="switchAdminTab('testing')">Real Test Center</button><button class="btn ghost" onclick="switchAdminTab('data');state.table='sync_events_v2';renderData()">Sync queue/history</button><button class="btn ghost" id=dbg>Собрать debug ZIP</button></div><div id=debugOut class=testResult></div></section>`); $('#start').onclick=async()=>{const r=await nvAdmin.startServer();toast(r.message);await refreshStatus();renderDashboard();}; $('#stop').onclick=async()=>{const r=await nvAdmin.stopServer();toast(r.message);await refreshStatus();renderDashboard();}; $('#restart').onclick=async()=>{await nvAdmin.stopServer().catch(()=>{}); const r=await nvAdmin.startServer();toast(r.message);await refreshStatus();renderDashboard();}; $('#dbg').onclick=async()=>{try{const r=await nvAdmin.debugReport();$('#debugOut').textContent=JSON.stringify(r,null,2);toast('Debug report ZIP собран');}catch(e){toast(e.message||String(e))}};}
function renderTesting(){const st=state.status?.server||{};layout(`<section class="panel"><div class="panelHead"><div><h2>Настоящий Admin Test Center</h2><p class="muted">Тесты создают записи, шифруют/дешифруют, гоняют sync push/pull, проверяют DB integrity и сохраняются в admin_test_runs.</p></div><div class="rowActions"><button class="btn" id="start">Запустить сервер</button><button class="btn ghost" id="stop">Остановить</button><button class="btn ghost" id="allTests">Все тесты</button></div></div><div class="grid">${nv130TestIds().map(id=>test(id,id.toUpperCase(),adminTestDesc(id))).join('')}</div><div id="result" class="testResult">Статус: ${h(st.message||'ожидание')}</div></section>`);$('#start').onclick=async()=>{const r=await nvAdmin.startServer();toast(r.message);await refreshStatus();renderTesting();};$('#stop').onclick=async()=>{const r=await nvAdmin.stopServer();toast(r.message);await refreshStatus();renderTesting();};$('#allTests').onclick=runAllTests;}
function adminTestDesc(id){return ({sqlite:'create → read → integrity',e2ee:'AES-GCM encrypt/decrypt',sync:'push → pull → cursor',server:'health endpoint',api:'API readiness',ports:'fixed port + fallback',logs:'буфер консоли',files:'hash + placeholder + dedupe',websocket:'heartbeat protocol', 'admin-auth':'IPC admin session', 'db-integrity':'PRAGMA integrity_check', renderer:'DOM snapshot + CSP', load:'100 сообщений в тестовый чат'}[id]||'real test')}
async function runAllTests(){const out=$('#result'); const ids=nv130TestIds(); const results=[]; for(const id of ids){try{out.textContent='Выполняю '+id+'…\n'+JSON.stringify(results,null,2); const r=await nvAdmin.runTest(id); results.push(r);}catch(e){results.push({name:id,passed:false,error:e.message||String(e)})}} out.textContent=JSON.stringify(results,null,2); await refreshStatus();}
function renderSettings(){layout(`<section class="panel settingsForm"><h2>Администратор</h2><p class="muted">Постоянный admin, PBKDF2-SHA256, версия 1.3.6. Ниже — инструменты диагностики тестеров.</p><input id="old" class="field" type="password" placeholder="Текущий пароль"><input id="next" class="field" type="password" placeholder="Новый пароль"><div class=buttonRow><button class="btn" id="chg">Сменить пароль</button><button class="btn ghost" id="dbg">Собрать Debug ZIP</button></div><div id=debugOut class=testResult>Debug ZIP не содержит пароли, токены, приватные ключи и расшифрованные сообщения.</div><div class=securityCard>Логин: admin<br>Sync Engine: v2/idempotency/cursors/tombstones<br>БД: migrations + read-only preview<br>Тесты: admin_test_runs</div></section>`);$('#chg').onclick=async()=>{try{await nvAdmin.changePassword({currentPassword:$('#old').value,nextPassword:$('#next').value});toast('Пароль администратора изменён');}catch(e){toast(e.message)}};$('#dbg').onclick=async()=>{try{const r=await nvAdmin.debugReport();$('#debugOut').textContent=JSON.stringify(r,null,2);toast('Debug report ZIP собран');}catch(e){toast(e.message||String(e))}};}

window.nvAdmin.onLog((line)=>{state.logs.push(line); if(state.logs.length>500)state.logs.shift(); const c=$('#console'); if(c){c.insertAdjacentHTML('beforeend',logLine(line)); c.scrollTo(0,999999);}});
setTimeout(async()=>{await refreshStatus();renderLogin();},650);


/* NightVault 1.3.6 — admin Radmin/LAN hosting labels */
(function nv134AdminUi(){
  const baseDashboard = renderDashboard;
  renderDashboard = function nv134RenderDashboard(){
    baseDashboard();
    const panel = document.querySelector('.panel');
    const st = state.status?.server || {};
    const hint = document.createElement('div');
    hint.className = 'securityCard';
    hint.innerHTML = '<b>Radmin/LAN режим</b><br>Кнопка “Запустить” поднимает сервер на <code>0.0.0.0:3000</code>. Друзьям в клиенте указывай <code>http://твой-Radmin-IP:3000</code>.' + (st.ok ? '<br>Текущий статус: ' + h(st.message || 'online') : '');
    panel?.appendChild(hint);
  };
})();

/* NightVault 1.3.6 — live admin refresh, console commands and admin themes */
(function nv135AdminLayer(){
  const THEMES = {
    crimson: { label:'Crimson', bg:'#120203', panel:'#1b080b', panel2:'#260d12', accent:'#e11b2f', accent2:'#8f1020', line:'#5a1722' },
    purple: { label:'Aurora Purple', bg:'#06040d', panel:'#0d0b18', panel2:'#151024', accent:'#8b5cf6', accent2:'#5b21b6', line:'#2b2147' },
    obsidian: { label:'Obsidian', bg:'#05070a', panel:'#080c12', panel2:'#111824', accent:'#8aa4ff', accent2:'#3d4d82', line:'#263248' },
    black: { label:'Blackout', bg:'#020202', panel:'#080808', panel2:'#111', accent:'#e8e8e8', accent2:'#555', line:'#2c2c2c' },
    matrix: { label:'Darknet Matrix', bg:'#030804', panel:'#071009', panel2:'#09190e', accent:'#00ff88', accent2:'#007a45', line:'#12442c' }
  };
  function applyAdminTheme(name){
    const theme = THEMES[name] || THEMES.crimson;
    localStorage.nvAdminTheme = name in THEMES ? name : 'crimson';
    const root = document.documentElement;
    root.style.setProperty('--bg', theme.bg);
    root.style.setProperty('--panel', theme.panel);
    root.style.setProperty('--panel2', theme.panel2);
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--accent2', theme.accent2);
    root.style.setProperty('--line', theme.line);
    document.body.dataset.adminTheme = localStorage.nvAdminTheme;
  }
  applyAdminTheme(localStorage.nvAdminTheme || 'crimson');

  const baseLayout135 = layout;
  layout = function nv135Layout(content){ baseLayout135(content); applyAdminTheme(localStorage.nvAdminTheme || 'crimson'); };

  renderConsole = function nv135RenderConsole(){
    layout(`<section class="panel"><div class="panelHead"><div><h2>Консоль сервера</h2><p class="muted">Live stdout/stderr, события API и команды администратора.</p></div><div class="rowActions"><button class="btn ghost" id="refresh">Обновить</button></div></div><div class="console" id="console">${state.logs.map(logLine).join('')}</div><div class="adminCommand"><input id="adminCmd" class="field" placeholder="Команда: help, stats, info user test, sessions test, chat <id>"><button class="btn" id="runCmd">Выполнить</button></div><pre id="cmdOut" class="testResult">Введите help для списка команд.</pre></section>`);
    $('#refresh').onclick=async()=>{await refreshStatus();renderConsole();};
    $('#runCmd').onclick=runAdminCommand;
    $('#adminCmd').addEventListener('keydown',e=>{if(e.key==='Enter')runAdminCommand();});
    setTimeout(()=>{$('#console')?.scrollTo(0,999999)},0);
  };
  async function runAdminCommand(){
    const cmd = $('#adminCmd')?.value || '';
    const out = $('#cmdOut');
    if(out) out.textContent = 'Выполняю: ' + cmd;
    try{
      const r = await nvAdmin.command(cmd);
      if(out) out.textContent = r?.text || JSON.stringify(r?.data ?? r, null, 2);
      await refreshStatus();
    }catch(e){ if(out) out.textContent='Ошибка команды: '+(e.message||e); toast(e.message||String(e)); }
  }

  const baseRenderSettings135 = renderSettings;
  renderSettings = function nv135RenderSettings(){
    layout(`<section class="panel settingsForm adminSettings135"><h2>Настройки админки</h2><p class="muted">Пароль, debug ZIP и визуальная тема Server Admin.</p><label class="muted">Тема админки</label><select id="adminTheme" class="field">${Object.entries(THEMES).map(([id,t])=>`<option value="${id}" ${localStorage.nvAdminTheme===id?'selected':''}>${t.label}</option>`).join('')}</select><input id="old" class="field" type="password" placeholder="Текущий пароль"><input id="next" class="field" type="password" placeholder="Новый пароль"><div class="buttonRow"><button class="btn" id="saveTheme">Применить тему</button><button class="btn" id="chg">Сменить пароль</button><button class="btn ghost" id="dbg">Собрать Debug ZIP</button></div><div id="debugOut" class="testResult">Debug ZIP не содержит пароли, токены, приватные ключи и расшифрованные сообщения.</div><div class="securityCard">Команды: help, stats, info user &lt;ник&gt;, sessions &lt;ник&gt;, chat &lt;id&gt;.<br>Данные и логи обновляются автоматически каждую секунду.</div></section>`);
    $('#adminTheme').onchange=(e)=>applyAdminTheme(e.target.value);
    $('#saveTheme').onclick=()=>{applyAdminTheme($('#adminTheme').value);toast('Тема админки сохранена');};
    $('#chg').onclick=async()=>{try{await nvAdmin.changePassword({currentPassword:$('#old').value,nextPassword:$('#next').value});toast('Пароль администратора изменён');}catch(e){toast(e.message)}};
    $('#dbg').onclick=async()=>{try{const r=await nvAdmin.debugReport();$('#debugOut').textContent=JSON.stringify(r,null,2);toast('Debug report ZIP собран');}catch(e){toast(e.message||String(e))}};
  };

  async function liveRefreshAdmin(){
    if(!state.logged) return;
    const tab = state.tab;
    try{
      await refreshStatus();
      if(tab === 'data' && state.table && !state.loadingTable){
        const rows = await nvAdmin.dbRead(state.table, Number(state.tableLimit || 100)).catch(()=>null);
        if(Array.isArray(rows)){
          const nextFp = rowFingerprint(rows);
          if(nextFp !== state.tableSeqText){ state.rows = rows; state.loadedTable = state.table; state.tableSeqText = nextFp; renderData(); return; }
        }
      }
      if(tab === 'console'){
        const c=$('#console');
        if(c){ c.innerHTML=state.logs.map(logLine).join(''); c.scrollTo(0,999999); }
      } else if(tab === 'logs') {
        const c=$('#console'); if(c){ c.innerHTML=state.logs.map(logLine).join(''); c.scrollTo(0,999999); }
      }
    }catch{}
  }
  if(!window.__nv135AdminLive){ window.__nv135AdminLive=true; setInterval(liveRefreshAdmin,1000); }

  titlebar = function nv135Titlebar(){return `<div class="titlebar"><div class="brand"><span class="dot"></span><span>NightVault Server Admin</span><em>1.3.6</em></div><div class="win"><button id="min">−</button><button id="max">▢</button><button id="close">×</button></div></div>`};
})();

/* NightVault 1.3.6 — quiet admin console, accent color and server data backup tools */
(function nv136AdminLayer(){
  const VERSION = '1.3.6';
  function isNoisy(line){
    const text = String(line?.text || '');
    return /\[api\]\s+GET\s+\/api\/(contacts|chats(?:\/[^\s]+\/messages)?)/i.test(text) || /\[api\]\s+POST\s+\/api\/ws-ticket/i.test(text);
  }
  function importantLogs(){ return (state.logs || []).filter((line) => !isNoisy(line)).slice(-220); }
  const baseRefresh136 = refreshStatus;
  refreshStatus = async function nv136RefreshStatus(){
    await baseRefresh136();
    state.logs = importantLogs();
  };
  const baseOnLog = window.nvAdmin?.onLog;
  // Старый onLog уже подключён выше, поэтому дополнительно чистим буфер перед отрисовкой.
  const baseLogLine136 = logLine;
  logLine = function nv136LogLine(line){ return isNoisy(line) ? '' : baseLogLine136(line); };

  function applyAccent(){
    const accent = localStorage.nvAdminAccent || getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#e11b2f';
    document.documentElement.style.setProperty('--accent', accent.trim() || '#e11b2f');
  }
  const baseLayout136 = layout;
  layout = function nv136Layout(content){ baseLayout136(content); applyAccent(); };

  titlebar = function nv136Titlebar(){return `<div class="titlebar"><div class="brand"><span class="dot"></span><span>NightVault Server Admin</span><em>${VERSION}</em></div><div class="win"><button id="min">−</button><button id="max">▢</button><button id="close">×</button></div></div>`};

  renderConsole = function nv136RenderConsole(){
    const logs = importantLogs();
    layout(`<section class="panel"><div class="panelHead"><div><h2>Консоль сервера</h2><p class="muted">Только важные события: запуск, регистрации, входы, ошибки, контакты, сообщения, файлы. Polling GET скрыт.</p></div><div class="rowActions"><button class="btn ghost" id="refresh">Обновить</button><button class="btn ghost" id="clearLocal">Очистить вид</button></div></div><div class="console" id="console">${logs.map(baseLogLine136).join('')}</div><div class="adminCommand"><input id="adminCmd" class="field" placeholder="Команда: help, stats, info user test, sessions test, chat <id>"><button class="btn" id="runCmd">Выполнить</button></div><pre id="cmdOut" class="testResult">Введите help для списка команд.</pre></section>`);
    $('#refresh').onclick=async()=>{await refreshStatus();renderConsole();};
    $('#clearLocal').onclick=()=>{state.logs=[];renderConsole();};
    $('#runCmd').onclick=runAdminCommand136;
    $('#adminCmd').addEventListener('keydown',e=>{if(e.key==='Enter')runAdminCommand136();});
    setTimeout(()=>{$('#console')?.scrollTo(0,999999)},0);
  };
  async function runAdminCommand136(){
    const cmd = $('#adminCmd')?.value || '';
    const out = $('#cmdOut');
    if(out) out.textContent = 'Выполняю: ' + cmd;
    try{ const r = await nvAdmin.command(cmd); if(out) out.textContent = r?.text || JSON.stringify(r?.data ?? r, null, 2); await refreshStatus(); }
    catch(e){ if(out) out.textContent='Ошибка команды: '+(e.message||e); toast(e.message||String(e)); }
  }

  renderSettings = function nv136RenderSettings(){
    const currentAccent = localStorage.nvAdminAccent || '#e11b2f';
    layout(`<section class="panel settingsForm adminSettings136"><h2>Настройки админки</h2><p class="muted">Тема, акцент, пароль, Debug ZIP и перенос серверной базы между обновлениями.</p><label class="muted">Тема админки</label><select id="adminTheme" class="field"><option value="crimson">Crimson</option><option value="purple">Aurora Purple</option><option value="obsidian">Obsidian</option><option value="black">Blackout</option><option value="matrix">Darknet Matrix</option></select><label class="muted">Акцентный цвет админки</label><input id="adminAccent" class="field" type="color" value="${h(currentAccent)}"><div class="buttonRow"><button class="btn" id="saveTheme">Применить вид</button><button class="btn ghost" id="exportData">Выгрузить данные сервера</button><button class="btn ghost" id="importData">Загрузить данные сервера</button></div><input id="old" class="field" type="password" placeholder="Текущий пароль"><input id="next" class="field" type="password" placeholder="Новый пароль"><div class="buttonRow"><button class="btn" id="chg">Сменить пароль</button><button class="btn ghost" id="dbg">Собрать Debug ZIP</button></div><div id="debugOut" class="testResult">Выгрузка данных содержит SQLite-состояние и uploads, чтобы перенести сервер на новую сборку.</div><div class="securityCard">Команды: help, stats, info user &lt;ник&gt;, sessions &lt;ник&gt;, chat &lt;id&gt;.<br>Логи очищены от GET polling-шума.</div></section>`);
    const theme = $('#adminTheme'); if(theme) theme.value = localStorage.nvAdminTheme || 'crimson';
    $('#adminAccent').oninput=(e)=>{localStorage.nvAdminAccent=e.target.value;applyAccent();};
    $('#saveTheme').onclick=()=>{localStorage.nvAdminTheme=$('#adminTheme').value;localStorage.nvAdminAccent=$('#adminAccent').value;applyAccent();toast('Вид админки сохранён');renderSettings();};
    $('#chg').onclick=async()=>{try{await nvAdmin.changePassword({currentPassword:$('#old').value,nextPassword:$('#next').value});toast('Пароль администратора изменён');}catch(e){toast(e.message)}};
    $('#dbg').onclick=async()=>{try{const r=await nvAdmin.debugReport();$('#debugOut').textContent=JSON.stringify(r,null,2);toast('Debug report ZIP собран');}catch(e){toast(e.message||String(e))}};
    $('#exportData').onclick=async()=>{try{const r=await nvAdmin.exportData(); if(r?.canceled)return; $('#debugOut').textContent=JSON.stringify(r,null,2); toast('Данные сервера выгружены');}catch(e){toast(e.message||String(e));}};
    $('#importData').onclick=async()=>{try{const r=await nvAdmin.importData(); if(r?.canceled)return; $('#debugOut').textContent=JSON.stringify(r,null,2); await refreshStatus(); toast('Данные сервера загружены');}catch(e){toast(e.message||String(e));}};
  };
})();
