'use strict';

const http = require('node:http');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';

const page = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chorum Verbindungstest</title>
<style>
:root{color-scheme:light dark;font-family:system-ui,Arial,sans-serif}body{max-width:740px;margin:42px auto;padding:0 20px;line-height:1.5}h1{font-size:1.6rem}.item{border:1px solid #8886;border-radius:10px;padding:12px 16px;margin:12px 0}.ok{color:#16824d}.bad{color:#d34b46}.wait{color:#bc7a09}button{padding:10px 17px;cursor:pointer;font:inherit}code{overflow-wrap:anywhere}small{color:gray}pre{white-space:pre-wrap;word-break:break-word}
</style></head><body>
<h1>Chorum – HTTPS-/WebSocket-Test</h1>
<p>Diese Seite prüft die Erreichbarkeit der Domain und ob der Browser einen WebSocket über dieselbe Domain aufbauen und Daten austauschen kann.</p>
<div class="item"><strong>HTTPS:</strong> <span id="https">Prüfung läuft …</span></div>
<div class="item"><strong>Server-API:</strong> <span id="api">Prüfung läuft …</span></div>
<div class="item"><strong>WebSocket (WSS):</strong> <span id="socket">Prüfung läuft …</span></div>
<div class="item"><strong>Echo-Test:</strong> <span id="echo">Wartet …</span></div>
<button id="retry">Tests wiederholen</button>
<p><small>Adresse: <code id="address"></code></small></p>
<pre id="details" aria-live="polite"></pre>
<p><small>Ein erfolgreicher Test bestätigt die technische Erreichbarkeit zu diesem Zeitpunkt, aber keine Freigabe durch die Firmen-IT und keine Garantie für MeshCentral.</small></p>
<script>
const $=id=>document.getElementById(id);
let ws=null;
function status(id,msg,cls){$(id).textContent=msg;$(id).className=cls}
function log(msg){$('details').textContent+=msg+'\\n'}
async function run(){
  if(ws){ws.onclose=null;ws.close();ws=null}
  $('details').textContent='';
  for(const id of ['https','api','socket','echo'])status(id,'Prüfung läuft …','wait');
  $('address').textContent=location.href;
  if(location.protocol==='https:')status('https','OK – Seite über HTTPS geladen','ok');
  else status('https','Nicht HTTPS – Testadresse über https:// öffnen','bad');
  try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),10000);
    let res;
    try {res=await fetch('/health',{cache:'no-store',signal:controller.signal})}finally{clearTimeout(timeout)}
    if(!res.ok)throw Error('HTTP '+res.status);
    const data=await res.json();
    status('api',data.status==='ok'?'OK – API antwortet':'Unerwartete Antwort','ok');
    log('API-Antwort: '+JSON.stringify(data));
  }catch(e){status('api','Fehler: '+e.message,'bad');log('API-Fehler: '+e.message)}
  const url=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws';
  log('WebSocket-Ziel: '+url);
  const token='chorum-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  let done=false;
  const sock=new WebSocket(url);ws=sock;
  const timer=setTimeout(()=>{if(!done){status('socket','Timeout nach 12 Sekunden','bad');status('echo','Nicht abgeschlossen','bad');sock.close()}},12000);
  sock.onopen=()=>{status('socket','OK – Verbindung aufgebaut','ok');sock.send(JSON.stringify({kind:'ping',token}))};
  sock.onmessage=event=>{
    try{const msg=JSON.parse(event.data);if(msg.kind==='pong'&&msg.token===token){
      done=true;clearTimeout(timer);status('echo','OK – Nachricht gesendet und korrekt empfangen','ok');log('Echo-Test erfolgreich');sock.close();
    }}catch(e){status('echo','Ungültige Serverantwort','bad');log(String(e))}
  };
  sock.onerror=()=>{if(!done){status('socket','WebSocket-Fehler (Netzwerk/Proxy/Server prüfen)','bad');log('WebSocket-Fehler')}};
  sock.onclose=()=>{clearTimeout(timer);if(!done)status('echo','Keine bestätigte Echo-Antwort','bad')};
}
$('retry').addEventListener('click',run);run();
</script></body></html>`;

const server = http.createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET' });
    return res.end('Method not allowed');
  }
  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ status: 'ok', service: 'chorum-connection-test' }));
  }
  if (path === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' wss: ws:; base-uri 'none'; form-action 'none'" });
    return res.end(page);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
server.on('upgrade', (request, socket, head) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path !== '/ws') return socket.destroy();
  wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws));
});
wss.on('connection', ws => {
  ws.on('message', buffer => {
    try {
      const msg = JSON.parse(buffer.toString());
      if (msg.kind === 'ping' && typeof msg.token === 'string' && msg.token.length < 200) {
        ws.send(JSON.stringify({ kind: 'pong', token: msg.token }));
      }
    } catch { /* Ignore invalid test messages. */ }
  });
});
server.listen(PORT, HOST, () => console.log(`Chorum test server listening on ${HOST}:${PORT}`));
