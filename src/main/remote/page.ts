/**
 * The page a paired phone opens. One file, no external requests. Everything the model says is
 * written with textContent, never as HTML, so a reply can't run code on the phone.
 */
const CSS = `
:root{--bg:#05070d;--surface:#0b101b;--surface-2:#121a29;--line:#1d2738;--text:#e7ecf5;--muted:#8a95aa;--accent:#7dd3fc;--ink:#04121c;--ok:#86efac;--bad:#fda4af;color-scheme:dark}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{background:var(--bg);color:var(--text);font:16px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;display:flex;flex-direction:column}
header{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line)}
header h1{font-size:18px;margin:0;flex:1}
.dot{width:10px;height:10px;border-radius:50%;background:var(--muted)}
.dot.on{background:var(--ok)}
.dot.busy{background:var(--accent);animation:p 1s infinite}
@keyframes p{50%{opacity:.3}}
button{font:inherit;color:inherit;border:1px solid var(--line);background:var(--surface);border-radius:12px;padding:8px 14px}
button.primary{background:var(--accent);color:var(--ink);border-color:var(--accent);font-weight:600}
#log{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:12px}
.me{align-self:flex-end;max-width:85%;background:var(--surface-2);border:1px solid var(--line);border-radius:16px;padding:8px 12px;white-space:pre-wrap;overflow-wrap:anywhere}
.nova{max-width:95%}
.nova .who{font-size:12px;color:var(--accent);margin-bottom:2px}
.nova .txt{white-space:pre-wrap;overflow-wrap:anywhere}
.step{font-size:13px;color:var(--muted);display:flex;gap:6px}
.step b{color:var(--accent);font-weight:600}
.step.error,.step.declined{color:var(--bad)}
.ask{border:1px solid var(--accent);border-radius:14px;padding:12px;background:var(--surface)}
.ask p{margin:0 0 4px;font-weight:600}
.ask pre{margin:0 0 10px;white-space:pre-wrap;font:inherit;color:var(--muted)}
.ask .row{display:flex;gap:8px}
.note{font-size:13px;color:var(--muted);text-align:center}
.err{color:var(--bad)}
form{display:flex;gap:8px;padding:10px 16px calc(10px + env(safe-area-inset-bottom));border-top:1px solid var(--line)}
input[type=text]{flex:1;min-width:0;font-size:16px;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.pair{margin:auto;text-align:center;padding:24px;color:var(--muted)}
`

const JS = `
(function(){
var $=function(i){return document.getElementById(i)};
var log=$('log'),dot=$('dot'),title=$('title'),input=$('msg'),act=$('act'),speakBtn=$('speak');
var token=null,busy=false,cur=null,steps={},steps_n=0,speak=false,ctl=null,retry=2000;
try{
  var m=/[#&]t=([\\w-]+)/.exec(location.hash);
  if(m){localStorage.setItem('nova-token',m[1]);history.replaceState(null,'',location.pathname)}
  token=localStorage.getItem('nova-token');
  speak=localStorage.getItem('nova-speak')==='1';
}catch(e){}
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function bottom(){log.scrollTop=log.scrollHeight}
function note(t,cls){log.appendChild(el('div','note '+(cls||''),t));bottom()}
function setBusy(b){busy=b;dot.className='dot '+(b?'busy':'on');act.textContent=b?'Stop':'Send';act.type=b?'button':'submit';act.className=b?'':'primary'}
function post(path,body){
  return fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body||{})}).then(function(r){
    if(r.status===401){unpair();throw new Error('unpaired')}
    if(!r.ok)throw new Error('failed');return r.json()
  })
}
function unpair(){try{localStorage.removeItem('nova-token')}catch(e){}token=null;if(ctl)ctl.abort();showPair()}
function showPair(){
  log.textContent='';var p=el('div','pair');
  p.appendChild(el('p',null,'This phone is not paired.'));
  p.appendChild(el('p',null,'On your PC open Nova, go to Settings, Phone, and scan the QR code with this phone.'));
  log.appendChild(p);dot.className='dot';
}
function newReply(){
  var box=el('div','nova');box.appendChild(el('div','who',title.textContent));
  var stepsBox=el('div');var txt=el('div','txt');box.appendChild(stepsBox);box.appendChild(txt);
  log.appendChild(box);cur={box:box,stepsBox:stepsBox,txt:txt,text:''};steps={};bottom()
}
function ensure(){if(!cur)newReply()}
function onEvent(e){
  if(e.type==='hello'){title.textContent=e.name||'Nova';dot.className='dot on';retry=2000;return}
  if(e.type==='user'){if(e.from==='phone')return;log.appendChild(el('div','me',e.text));bottom();setBusy(true);cur=null;return}
  if(e.type==='start'){cur=null;newReply();setBusy(true);return}
  if(e.type==='text'){ensure();cur.text+=e.delta;cur.txt.textContent=cur.text;bottom();return}
  if(e.type==='tool'){
    ensure();var row=steps[e.id];
    if(!row){row=el('div','step');steps[e.id]=row;cur.stepsBox.appendChild(row)}
    row.className='step '+e.status;row.textContent='';
    var mark=e.status==='running'?'…':e.status==='done'?'✓':e.status==='declined'?'–':'!';
    row.appendChild(el('span',null,mark));
    var t=el('span');if(e.agent){t.appendChild(el('b',null,e.agent+' · '))}
    t.appendChild(document.createTextNode(e.summary||e.label));row.appendChild(t);bottom();return
  }
  if(e.type==='confirm'){
    ensure();var q=el('div','ask');q.appendChild(el('p',null,e.title));q.appendChild(el('pre',null,e.detail));
    var r=el('div','row');var yes=el('button','primary','Allow'),no=el('button',null,"Don't allow");
    function answer(ok){q.remove();post('/api/confirm',{id:e.id,approved:ok}).catch(function(){})}
    yes.onclick=function(){answer(true)};no.onclick=function(){answer(false)};
    r.appendChild(yes);r.appendChild(no);q.appendChild(r);log.appendChild(q);bottom();return
  }
  if(e.type==='done'){
    document.querySelectorAll('.ask').forEach(function(a){a.remove()});
    setBusy(false);
    if(speak&&cur&&cur.text&&window.speechSynthesis){try{speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(cur.text))}catch(x){}}
    cur=null;return
  }
  if(e.type==='error'){ensure();cur.txt.textContent=e.message;cur.txt.className='txt err';setBusy(false);cur=null;return}
  if(e.type==='notify'){note(e.title+': '+e.body)}
}
function connect(){
  if(!token){showPair();return}
  ctl=new AbortController();dot.className='dot';
  fetch('/api/events',{headers:{Authorization:'Bearer '+token},signal:ctl.signal}).then(function(r){
    if(r.status===401){unpair();return}
    if(!r.ok||!r.body)throw new Error('bad');
    var rd=r.body.getReader(),dec=new TextDecoder(),buf='';
    function pump(){return rd.read().then(function(x){
      if(x.done)throw new Error('closed');
      buf+=dec.decode(x.value,{stream:true});var parts=buf.split('\\n\\n');buf=parts.pop();
      parts.forEach(function(p){var l=p.split('\\n').filter(function(s){return s.indexOf('data:')===0})[0];
        if(l){try{onEvent(JSON.parse(l.slice(5)))}catch(x){}}});
      return pump()})}
    return pump()
  }).catch(function(){
    if(!token)return;dot.className='dot';
    setTimeout(connect,retry);retry=Math.min(retry*1.5,15000)
  })
}
$('form').onsubmit=function(ev){
  ev.preventDefault();if(busy)return;
  var t=input.value.trim();if(!t||!token)return;
  input.value='';log.appendChild(el('div','me',t));cur=null;setBusy(true);bottom();
  post('/api/send',{text:t}).catch(function(){setBusy(false);note('Could not reach Nova. Is your PC on and on the same Wi-Fi?','err')})
};
act.onclick=function(){if(busy){post('/api/stop').catch(function(){})}};
$('fresh').onclick=function(){if(!token)return;post('/api/new').then(function(){log.textContent='';cur=null;setBusy(false)}).catch(function(){})};
speakBtn.onclick=function(){speak=!speak;speakBtn.textContent=speak?'Voice on':'Voice off';try{localStorage.setItem('nova-speak',speak?'1':'0')}catch(e){}if(!speak&&window.speechSynthesis)speechSynthesis.cancel()};
speakBtn.textContent=speak?'Voice on':'Voice off';
if(!window.speechSynthesis)speakBtn.hidden=true;
connect();
})();
`

export function phonePage(nonce: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#05070d">
<title>Nova</title>
<style nonce="${nonce}">${CSS}</style></head>
<body>
<header><span id="dot" class="dot"></span><h1 id="title">Nova</h1><button id="speak" type="button">Voice off</button><button id="fresh" type="button" aria-label="New chat">New</button></header>
<main id="log" role="log" aria-live="polite"></main>
<form id="form"><input id="msg" type="text" placeholder="Message Nova" autocomplete="off" maxlength="4000" aria-label="Message Nova"><button id="act" class="primary" type="submit">Send</button></form>
<script nonce="${nonce}">${JS}</script>
</body></html>`
}
