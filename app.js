/* ---------- header + reveals ---------- */
(function(){
  var hdr=document.getElementById('hdr');
  if(hdr){var onScroll=function(){hdr.classList.toggle('scrolled',window.scrollY>40)};window.addEventListener('scroll',onScroll,{passive:true});onScroll();}
  var io=new IntersectionObserver(function(entries){
    entries.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target)}});
  },{threshold:0.15});
  document.querySelectorAll('.reveal').forEach(function(el){io.observe(el)});

  /* count-up for trust numbers */
  var counters=document.querySelectorAll('.num[data-count]');
  var cio=new IntersectionObserver(function(es){es.forEach(function(e){
    if(!e.isIntersecting)return; cio.unobserve(e.target);
    var el=e.target,target=+el.getAttribute('data-count'),suf=el.getAttribute('data-suffix')||'',t0=null;
    function step(ts){if(!t0)t0=ts;var p=Math.min((ts-t0)/1100,1);var val=Math.round((1-Math.pow(1-p,3))*target);
      el.innerHTML=val+'<span>'+suf+'</span>';if(p<1)requestAnimationFrame(step);}
    requestAnimationFrame(step);
  });},{threshold:0.5});
  counters.forEach(function(el){cio.observe(el)});
})();

/* ---------- interactive attitude indicator ---------- */
(function(){
  var svg=document.getElementById('ai'),hz=document.getElementById('aiHorizon'),bk=document.getElementById('aiBank');
  if(!svg||!hz)return;
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var tBank=0,tPitch=0,cBank=0,cPitch=0,active=false,last=0;
  function setTarget(e){
    var r=svg.getBoundingClientRect();
    var px=(e.clientX-r.left)/r.width, py=(e.clientY-r.top)/r.height;
    tBank=(px-0.5)*-44;            /* +/-22 deg */
    tPitch=(py-0.5)*32;            /* +/-16 px  */
    active=true;last=performance.now();
  }
  svg.addEventListener('mousemove',setTarget);
  svg.addEventListener('mouseleave',function(){active=false;});
  if(window.DeviceOrientationEvent){
    window.addEventListener('deviceorientation',function(ev){
      if(ev.gamma==null)return;
      tBank=Math.max(-22,Math.min(22,ev.gamma));
      tPitch=Math.max(-16,Math.min(16,((ev.beta||0)-20)*0.4));
      active=true;last=performance.now();
    });
  }
  function frame(ts){
    if(!active && !reduce){ /* gentle idle sway */
      var t=ts/1000; tBank=Math.sin(t*0.55)*7; tPitch=Math.sin(t*0.4+1)*4;
    }
    if(reduce){cBank=tBank=0;cPitch=tPitch=0;}
    cBank+=(tBank-cBank)*0.09; cPitch+=(tPitch-cPitch)*0.09;
    hz.setAttribute('transform','rotate('+cBank.toFixed(2)+' 180 176) translate(0 '+cPitch.toFixed(2)+')');
    if(bk)bk.setAttribute('transform','rotate('+cBank.toFixed(2)+' 180 176)');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

/* ---------- live KMDW weather (NWS api.weather.gov) ---------- */
(function(){
  var raw=document.getElementById('wxRaw'),cat=document.getElementById('wxCat');
  function set(f,v){var el=document.querySelector('.wx-cell .v[data-f="'+f+'"]');if(el)el.textContent=v;}
  function fail(){
    if(raw)raw.innerHTML='Live feed unavailable. <a href="https://aviationweather.gov/data/metar/?id=KMDW&hours=0" target="_blank" rel="noopener">view KMDW METAR &#8599;</a>';
  }
  function fmtWind(dir,spd){
    if(spd==null)return '--';
    if(spd<1)return 'Calm';
    var d=(dir==null)?'VRB':(Math.round(dir/10)*10).toString().padStart(3,'0');
    return d+'° @ '+Math.round(spd)+' kt';
  }
  function category(ceil,vis){
    if(ceil==null&&vis==null)return null;
    var c=ceil==null?99999:ceil, v=vis==null?99:vis;
    if(c<500||v<1)return 'LIFR';
    if(c<1000||v<3)return 'IFR';
    if(c<=3000||v<=5)return 'MVFR';
    return 'VFR';
  }
  function loadWx(){
  try{
    fetch('https://api.weather.gov/stations/KMDW/observations/latest',{headers:{'Accept':'application/geo+json'}})
    .then(function(r){if(!r.ok)throw 0;return r.json();})
    .then(function(j){
      var p=j.properties;if(!p)throw 0;
      /* wind: convert to knots from unit */
      var wsv=p.windSpeed&&p.windSpeed.value, wsu=(p.windSpeed&&p.windSpeed.unitCode)||'';
      var kt=null;
      if(wsv!=null){kt= wsu.indexOf('m_s')>-1 ? wsv*1.943844 : wsv/1.852;}
      set('wind',fmtWind(p.windDirection&&p.windDirection.value,kt));
      /* visibility m -> SM */
      var sm=null;
      if(p.visibility&&p.visibility.value!=null){sm=p.visibility.value/1609.344;set('vis',(sm>=1?Math.round(sm):sm.toFixed(1))+' SM');}
      /* ceiling from cloud layers (BKN/OVC), m -> ft */
      var ceil=null;
      if(p.cloudLayers&&p.cloudLayers.length){
        p.cloudLayers.forEach(function(l){
          if((l.amount==='BKN'||l.amount==='OVC')&&l.base&&l.base.value!=null){
            var ft=l.base.value*3.28084; if(ceil==null||ft<ceil)ceil=ft;
          }
        });
      }
      set('ceil',ceil==null?'Clear / SCT':(Math.round(ceil/100)*100).toLocaleString()+' ft');
      /* altimeter Pa -> inHg */
      if(p.barometricPressure&&p.barometricPressure.value!=null){
        set('alt',(p.barometricPressure.value/3386.389).toFixed(2)+' inHg');
      }
      /* temp C -> show C/F */
      if(p.temperature&&p.temperature.value!=null){
        var c=p.temperature.value; set('temp',Math.round(c)+'°C / '+Math.round(c*9/5+32)+'°F');
      }
      /* category */
      var fc=category(ceil,sm);
      if(fc&&cat){cat.setAttribute('data-cat',fc);cat.textContent=fc;}
      /* raw metar */
      if(raw){
        var t=p.timestamp?new Date(p.timestamp):null;
        var ago=t?(' · '+t.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})):'';
        raw.textContent=(p.rawMessage||'')+ago;
      }
    })
    .catch(fail);
  }catch(e){fail();}
  }
  loadWx();
  setInterval(loadWx, 600000); /* refresh every 10 min */
})();

/* ---------- lightbox ---------- */
(function(){
  var items=[].slice.call(document.querySelectorAll('.gal-item'));
  var lb=document.getElementById('lb'),img=document.getElementById('lbImg'),cap=document.getElementById('lbCap');
  if(!lb)return; /* no lightbox on interior pages */
  var i=0;
  function open(n){i=(n+items.length)%items.length;var it=items[i];img.src=it.getAttribute('data-src');img.alt=it.querySelector('img').alt;cap.textContent=it.getAttribute('data-cap')||'';lb.classList.add('show');}
  function close(){lb.classList.remove('show');img.src='';}
  items.forEach(function(it,n){it.addEventListener('click',function(){open(n);});});
  document.getElementById('lbClose').addEventListener('click',close);
  document.getElementById('lbNext').addEventListener('click',function(e){e.stopPropagation();open(i+1);});
  document.getElementById('lbPrev').addEventListener('click',function(e){e.stopPropagation();open(i-1);});
  lb.addEventListener('click',function(e){if(e.target===lb)close();});
  document.addEventListener('keydown',function(e){if(!lb.classList.contains('show'))return;if(e.key==='Escape')close();if(e.key==='ArrowRight')open(i+1);if(e.key==='ArrowLeft')open(i-1);});
})();

/* ---------- contact form (Web3Forms -> emails apimidway@gmail.com) ---------- */
function submitLead(ev){
  ev.preventDefault();
  var form=ev.target,btn=document.getElementById('leadBtn'),err=document.getElementById('formErr');
  err.style.display='none';
  var key=form.querySelector('[name=access_key]').value;
  var done=function(){form.style.display='none';var c=document.getElementById('confirm');if(c)c.classList.add('show');};
  /* If key not yet set, don't hit the API with a bad key, still confirm for the visitor. */
  if(!key||key.indexOf('PLACEHOLDER')>-1){done();return false;}
  btn.disabled=true;btn.textContent='Sending…';
  fetch('https://api.web3forms.com/submit',{
    method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(Object.fromEntries(new FormData(form).entries()))
  }).then(function(r){return r.json();}).then(function(d){
    if(d.success){done();}else{throw 0;}
  }).catch(function(){
    btn.disabled=false;btn.textContent='Request my callback';err.style.display='block';
  });
  return false;
}

/* mobile hamburger menu */
(function(){
  var btn=document.getElementById('menuBtn'),mnav=document.getElementById('mnav'),back=document.getElementById('mnavBack');
  if(!btn||!mnav)return;
  function toggle(open){
    var o=(open===undefined)?!mnav.classList.contains('show'):open;
    mnav.classList.toggle('show',o);btn.classList.toggle('open',o);
    if(back)back.classList.toggle('show',o);
    btn.setAttribute('aria-expanded',o);mnav.setAttribute('aria-hidden',!o);
    document.body.style.overflow=o?'hidden':'';
  }
  btn.addEventListener('click',function(){toggle();});
  if(back)back.addEventListener('click',function(){toggle(false);});
  mnav.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){toggle(false);});});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')toggle(false);});
})();

/* redeploy 1782355189 */
