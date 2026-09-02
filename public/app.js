// ============================================================
// ESTADO
// ============================================================
var G={
  meses:[],mesActual:null,mesData:null,
  histMes:null,histData:null,
  balance:null,tarjetas:null,japon:null,pinturas:null,flujo:null,catalogo:null,configuracion:null,
  txs:[],tipoModal:null,chFlujo:null,
  notifOpen:false,srchOpen:false,
  balEdit:false,japEdit:false,pintEdit:false,
  tcIdx:0,tdcAnio:2026,tcMesActual:null,
  tdcAccion:null,tdcMovs:[],tdcEditId:null,tdcDeleteId:null,tdcAbonoCargoId:null,tdcExpanded:false,tdcDifMode:null,tdcDiferidos:[],
  tdcMovsAplicados:[],
  calFecha:new Date(),prCats:null,catResumen:null,
  catManage:null,
  movimientos:[],movimientosMes:null,editTx:null,deleteTx:null,
  histFiltroTipo:'todos',histFiltroCat:'todos',histOrden:'recientes',histFechaIni:'',histFechaFin:'',
  _dirty:false,_dirtyFlujo:false,_dirtyBalance:false,_dirtyTarjetas:false  // flags de refresco
};
var MESES_NOM_JS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
var NECESIDAD_BALANCE_DEFAULT={
  'aporte seguro':'10101.06',
  'aporte caja':'10101.01'
};
var SUBCATS={
  necesidad:['Plan Celular','Aporte Seguro','Aporte caja','Comida Diaria','Salud','Transporte','Arriendo','Internet','Pinturas'],
  deseo:    ['Comida Fuera','Ropa','Gastos Familia','Fútbol','Entretenimiento','Cerveza','Tabaco','Gastos Bancarios','Gasolina','Pagos Tienda','Gastos personales'],
  deuda:    ['Diferido Artefacta','Devolución Terreno','Brackets'],
  ahorro:   ['Programado Tulcán','Programado Caja','Ahorro Flexible','Devolución Ahorro 1','Devolución Ahorro 2'],
  ingreso:  ['Sueldo','Préstamos TDC','Pinturas','Trabajos Mkt','Cobro Préstamos','Devolución de ahorro','Préstamos recibidos']
};
var ICONOS={'Plan Celular':'📱','Comida Diaria':'🍽️','Salud':'💊','Transporte':'🚗','Arriendo':'🏠','Internet':'🌐','Comida Fuera':'🍔','Ropa':'👕','Entretenimiento':'🎮','Cerveza':'🍺','Sueldo':'💰','Pinturas':'🎨','Brackets':'🦷','default':'💳'};
var CARD_LOGOS={
  visa:'https://finanzas-personales-5aac.vercel.app/visa-logo.webp?v=20260814-1',
  mastercard:'https://finanzas-personales-5aac.vercel.app/mastercard-logo.webp?v=20260814-1'
};

function eid(i){return document.getElementById(i);}
function qsa(sel){return Array.prototype.slice.call(document.querySelectorAll(sel));}
function fmt(n){n=parseFloat(n)||0;return '$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function hEsc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function nE(s){
  s=String(s==null?'':s).trim().toLowerCase();
  try{if(s.normalize)s=s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');}catch(e){}
  return s.replace(/\s+/g,' ');
}
function uniqCanon(arr){
  var seen={},out=[];
  (arr||[]).forEach(function(v){
    var label=String(v==null?'':v).trim();
    if(!label)return;
    var key=nE(label);
    if(!seen[key]){seen[key]=true;out.push(label);}
  });
  return out;
}
function moneyVal(v){
  if(typeof v==='string')v=v.trim().replace(/\s/g,'').replace(',','.');
  return parseFloat(v)||0;
}
function normMoney(v){return String(moneyVal(v));}
function pw(a,m){return m>0?Math.min((a/m)*100,100):0;}
function st(p,a){if(!a||!p)return'e';var r=a/p;if(r<=0.85)return'ok';if(r<=1)return'warn';return'over';}
function pad2(n){n=parseInt(n,10)||0;return n<10?'0'+n:String(n);}
function todayISO(){var d=new Date();return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());}
function todayFull(){return new Date().toLocaleDateString('es-EC',{day:'2-digit',month:'2-digit',year:'numeric'});}
function localDateParts(v){
  var s=String(v||'').trim();if(!s)return null;
  if(s.indexOf('T')>-1)s=s.split('T')[0];
  var p=s.indexOf('/')>-1?s.split('/'):s.split('-');
  if(p.length===3){
    var y=p[0].length===4?p[0]:p[2],m=p[0].length===4?p[1]:p[1],d=p[0].length===4?p[2]:p[0];
    y=parseInt(y,10);m=parseInt(m,10);d=parseInt(d,10);
    if(y&&m>=1&&m<=12&&d>=1&&d<=31)return{y:y,m:m,d:d};
  }
  return null;
}
function localDateMs(v){
  var p=localDateParts(v);
  return p?new Date(p.y,p.m-1,p.d,12,0,0).getTime():0;
}
function fmtFecha(v){
  var s=String(v||'');if(!s)return'-';
  var lp=localDateParts(s);
  if(lp)return pad2(lp.d)+'/'+pad2(lp.m)+'/'+lp.y;
  if(s.indexOf('GMT')>-1){
    var d=new Date(s);
    if(!isNaN(d.getTime())) return d.toLocaleDateString('es-EC',{day:'2-digit',month:'2-digit',year:'numeric'});
  }
  var fl=s.split('T')[0],p=fl.split('-');
  return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:fl;
}

function catalogItems(tipo){
  var c=G.catalogo&&G.catalogo.items?G.catalogo.items[tipo]:null;
  return c||[];
}
function subcatsDesdeMesActual(tipo){
  var secKey={necesidad:'necesidades',deseo:'deseos',deuda:'deudas',ahorro:'ahorros'}[tipo];
  var sec=secKey&&G.mesData?G.mesData[secKey]:null;
  if(!sec||!sec.items||!sec.items.length)return null;
  return uniqCanon(sec.items.filter(function(x){
    return x&&x.nombre&&((x.presupuesto||x.préstamo||0)>0||(x.actual||0)>0);
  }).map(function(x){return x.nombre;}));
}
function catalogSubcats(tipo){
  var c=G.catalogo&&G.catalogo.subcats?G.catalogo.subcats[tipo]:null;
  var base=(SUBCATS[tipo]||[]).slice();
  if(tipo==='ingreso') return uniqCanon(base.concat(c||[]));
  if(tipo==='necesidad'||tipo==='deseo'||tipo==='ahorro'||tipo==='deuda'){
    var mesItems=subcatsDesdeMesActual(tipo);
    if(mesItems&&mesItems.length)return mesItems;
  }
  if(tipo==='ahorro'||tipo==='deuda') return uniqCanon(c&&c.length?c:[]);
  return uniqCanon(c&&c.length?c:base);
}
function loadCatalogo(){
  return gsRun('getCatalogoFinanciero').then(function(res){
    if(res&&res.ok&&res.data){G.catalogo=res.data;return res.data;}
    return null;
  });
}
function balanceGrupos(tipo){
  var g=G.catalogo&&G.catalogo.grupos?G.catalogo.grupos[tipo]:null;
  return uniqCanon(g&&g.length?g:(tipo==='Pasivo'?['Tarjeta de Crédito','Préstamos','Pasivos Fijos']:['Efectivo y Equivalentes','Activos Financieros','Cuentas por Cobrar','Inventarios','Inmuebles','Equipos']));
}
function fillBalanceGrupoSelect(id,tipo,val){
  var el=eid(id);if(!el)return;
  el.innerHTML=balanceGrupos(tipo).map(function(g){return'<option value="'+hEsc(g)+'">'+hEsc(g)+'</option>';}).join('');
  if(val)el.value=val;
}
function balanceDestinos(tipo){
  var arr=G.catalogo?(tipo==='Pasivo'?G.catalogo.pasivos:G.catalogo.activos):[];
  return arr||[];
}
function fillBalanceDestinoSelect(id,tipo,val,allowNew){
  var el=eid(id);if(!el)return;
  var opts=['<option value="">Selecciona...</option>'];
  balanceDestinos(tipo).forEach(function(x){opts.push('<option value="'+hEsc(x.codigo)+'">'+hEsc((x.grupo?x.grupo+' > ':'')+x.nombre)+'</option>');});
  if(allowNew)opts.push('<option value="__new">Crear nuevo...</option>');
  el.innerHTML=opts.join('');
  if(val)el.value=val;
}
function catalogFind(tipo,nombre){
  return catalogItems(tipo).filter(function(x){return nE(x.nombre)===nE(nombre);})[0]||null;
}
function actualizarBalanceBox(){
  var box=eid('m-balance-box');if(!box)return;
  var tipo=G.tipoModal,sub=eid('m-sub')?eid('m-sub').value:'';
  var isNecesidad=tipo==='necesidad';
  if(!G.catalogo&&(tipo==='ahorro'||tipo==='deuda'||isNecesidad||sub==='Devolución de ahorro'||sub==='Préstamos recibidos')){
    loadCatalogo().then(actualizarBalanceBox);
    return;
  }
  var isDev=tipo==='ingreso'&&sub==='Devolución de ahorro';
  var isPre=tipo==='ingreso'&&sub==='Préstamos recibidos';
  var isCat=tipo==='ahorro'||tipo==='deuda';
  box.style.display=(isDev||isPre||isCat||isNecesidad)?'block':'none';
  eid('m-balance-new').style.display='none';eid('m-balance-grupo').style.display='none';
  eid('m-balance-dest').onchange=null;
  if(isCat){
    var it=catalogFind(tipo,sub);
    eid('m-balance-label').textContent='Destino balance';
    eid('m-balance-dest').style.display='none';
    eid('m-balance-hint').textContent=it&&it.balanceNombre?'Se alojara en '+it.grupo+' > '+it.balanceNombre:'Debes asignarlo desde Gestionar antes de guardar.';
  }else if(isNecesidad){
    var sugerido=NECESIDAD_BALANCE_DEFAULT[nE(sub)]||'';
    eid('m-balance-label').textContent='Impacto en balance';
    eid('m-balance-dest').style.display='block';
    fillBalanceDestinoSelect('m-balance-dest','Activo',sugerido,false);
    eid('m-balance-hint').textContent=sugerido?'Este egreso baja caja y aumenta el activo seleccionado.':'Opcional: elige un activo si este egreso tambien aumenta tu balance.';
  }else if(isDev){
    eid('m-balance-label').textContent='Retirar desde activo';
    eid('m-balance-dest').style.display='block';fillBalanceDestinoSelect('m-balance-dest','Activo','',false);
    eid('m-balance-hint').textContent='Este ingreso sube caja y baja el activo seleccionado.';
  }else if(isPre){
    eid('m-balance-label').textContent='Pasivo del préstamo';
    eid('m-balance-dest').style.display='block';fillBalanceDestinoSelect('m-balance-dest','Pasivo','',true);
    fillBalanceGrupoSelect('m-balance-grupo','Pasivo');
    eid('m-balance-dest').onchange=function(){var n=this.value==='__new';eid('m-balance-new').style.display=n?'block':'none';eid('m-balance-grupo').style.display=n?'block':'none';};
    eid('m-balance-hint').textContent='Este ingreso sube caja, ingresos del flujo y el pasivo elegido.';
  }
}
function catBalanceDestChange(){
  var sel=eid('cat-balance-dest'),nw=eid('cat-balance-new');if(!sel||!nw)return;
  nw.style.display=sel.value==='__new'?'block':'none';
}

function tipoLabel(t){return t==='ingreso'?'Ingreso':t==='ahorro'?'Ahorro':esEgresoTipo(t)?'Egreso':(t||'-');}
function esEgresoTipo(t){return['necesidad','deseo','deuda'].indexOf(t)>=0;}
function getCategoriasDetalle(d){
  if(!d)return[];
  var vg=d.vistaGeneral||{},ing=d.ingresos?d.ingresos.totalActual:(vg.ingresos?vg.ingresos.actual:0),mt=d.metricas||{};
  return[
    {t:'Necesidades',d:d.necesidades,v:d.necesidades?d.necesidades.total:0,meta:mt.necDeudas?mt.necDeudas.valEst*0.65:ing*0.325,aho:false},
    {t:'Deseos',d:d.deseos,v:d.deseos?d.deseos.total:0,meta:mt.deseos?mt.deseos.valEst:ing*0.30,aho:false},
    {t:'Deudas',d:d.deudas,v:d.deudas?d.deudas.total:0,meta:mt.necDeudas?mt.necDeudas.valEst*0.35:ing*0.175,aho:false},
    {t:'Ahorros',d:d.ahorros,v:d.ahorros?(d.ahorros.total||d.ahorros.totalCalculado||0):0,meta:mt.ahorros?mt.ahorros.valEst:ing*0.20,aho:true}
  ];
}
function porcentajesDistribucion(cats){
  cats=cats||[];
  var vals=cats.map(function(c){return Math.max(0,parseFloat(c.v)||0);});
  var total=vals.reduce(function(a,v){return a+v;},0);
  if(total<=0)return cats.map(function(){return 0;});
  var raw=vals.map(function(v){return v*100/total;});
  var base=raw.map(Math.floor);
  var resto=100-base.reduce(function(a,v){return a+v;},0);
  raw.map(function(v,i){return{i:i,r:v-base[i]};})
    .sort(function(a,b){return b.r-a.r;})
    .slice(0,resto)
    .forEach(function(x){base[x.i]++;});
  return base;
}
function cacheGet(k){
  try{
    if(String(k).indexOf('mesData_')===0)return null;
    var raw=localStorage.getItem('js_'+k);
    if(!raw)return null;
    var obj=JSON.parse(raw);
    if(!obj||!obj.t||Date.now()-obj.t>20*60*1000)return null;
    return obj.v;
  }catch(e){return null;}
}
function cacheSet(k,v){
  try{
    if(String(k).indexOf('mesData_')===0)return;
    localStorage.setItem('js_'+k,JSON.stringify({t:Date.now(),v:v}));
  }catch(e){}
}
function cacheDel(k){
  try{localStorage.removeItem('js_'+k);}catch(e){}
}
function bootCacheKey(mes){
  return 'bootHome_'+String(mes||'').replace(/\s+/g,'_');
}
function cacheGetBootHome(mes){
  var d=cacheGet(bootCacheKey(mes));
  return d&&d.mes===mes&&d.vistaGeneral?d:null;
}
function cacheSetBootHome(mes,data){
  if(mes&&data&&data.vistaGeneral)cacheSet(bootCacheKey(mes),data);
}
function cacheKeyMes(prefix,mes){
  return prefix+'_'+String(mes||'').replace(/\s+/g,'_');
}
function cacheGetMovimientos(mes){
  var d=cacheGet(cacheKeyMes('movs',mes));
  return d&&d.mes===mes&&Array.isArray(d.data)?d.data:null;
}
function cacheSetMovimientos(mes,data){
  if(mes&&Array.isArray(data))cacheSet(cacheKeyMes('movs',mes),{mes:mes,data:data});
}
function cacheGetPinturas(mes){
  var d=cacheGet(cacheKeyMes('pinturas',mes));
  return d&&d.mes===mes?d:null;
}
function cacheSetPinturas(mes,data){
  if(mes&&data)cacheSet(cacheKeyMes('pinturas',mes),Object.assign({},data,{mes:mes}));
}
function tarjetasCacheKey(opts){
  opts=opts||{};
  return 'tarjetas_'+String(opts.mes||'').replace(/\s+/g,'_')+'_'+(opts.idx||0)+'_'+(opts.anio||2026);
}
function cacheGetTarjetas(opts){
  return cacheGet(tarjetasCacheKey(opts));
}
function cacheSetTarjetas(opts,res){
  if(res&&res.ok!==false)cacheSet(tarjetasCacheKey(opts),res);
}
function getSaldoData(d){
  return d&&d.vistaGeneral&&d.vistaGeneral.saldoFinal?parseFloat(d.vistaGeneral.saldoFinal.actual)||0:0;
}
function setSaldoData(d,v){
  d.vistaGeneral=d.vistaGeneral||{};
  d.vistaGeneral.saldoFinal=d.vistaGeneral.saldoFinal||{presupuesto:0,actual:0};
  d.vistaGeneral.saldoFinal.actual=Math.round((v+Number.EPSILON)*100)/100;
}
function mesOrdenNombre(m){
  var p=String(m||'').split(' ');
  if(p.length!==2)return -1;
  var idx=MESES_NOM_JS.indexOf(p[0]),yy=parseInt(p[1],10);
  return idx<0||isNaN(yy)?-1:yy*12+idx;
}
function anioDesdeMesNombre(m){
  var p=String(m||'').trim().split(/\s+/),yy=parseInt(p[1],10);
  return p.length===2&&!isNaN(yy)?2000+yy:(new Date().getFullYear());
}
function aplicarSaldoEsperado(d,mes){
  return d;
}
function mesActualCalendario(){
  var hoy=new Date();
  return MESES_NOM_JS[hoy.getMonth()]+' '+String(hoy.getFullYear()).slice(-2);
}
function asegurarMesesCliente(meses){
  meses=(meses||[]).slice().filter(Boolean);
  var actual=mesActualCalendario();
  var siguiente=mesSiguienteNombre(actual);
  [actual,siguiente].forEach(function(m){
    if(m&&meses.indexOf(m)<0)meses.push(m);
  });
  meses.sort(function(a,b){return mesOrdenNombre(a)-mesOrdenNombre(b);});
  return meses;
}
function getMesActual(meses){
  var cal=mesActualCalendario();
  meses=(meses||[]).slice();
  if(meses.indexOf(cal)>=0)return cal;
  meses.sort(function(a,b){return mesOrdenNombre(a)-mesOrdenNombre(b);});
  if(meses.length)return meses[meses.length-1];
  return cal;
}
function mesInicioActivo(){
  var sel=eid('sel-h');
  var visible=sel&&sel.value?sel.value:'';
  return visible||G.mesActual||mesActualCalendario();
}
function showToast(msg,tipo){
  var el=document.createElement('div');el.className='toast '+(tipo||'ok');el.textContent=msg;
  document.body.appendChild(el);setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},2900);
}
function showSucc(){
  var el=document.createElement('div');el.className='spop';el.textContent='✓';
  document.body.appendChild(el);setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},1200);
}

function bootText(t){var el=eid('boot-copy');if(el)el.textContent=t;}
function hideBootLoader(){
  var el=eid('boot-loader');if(!el)return;
  el.classList.add('done');
  setTimeout(function(){if(el&&el.parentNode)el.parentNode.removeChild(el);},420);
}
function gsRun(fn,args){
  return new Promise(function(resolve,reject){
    try{
      var runner=google.script.run.withSuccessHandler(resolve).withFailureHandler(reject);
      var call=runner[fn];
      if(typeof call!=='function'){reject(new Error('Funcion no disponible: '+fn));return;}
      call.apply(runner,args||[]);
    }catch(e){reject(e);}
  });
}
function withTimeout(p,ms,label){
  return Promise.race([
    p,
    new Promise(function(resolve){setTimeout(function(){resolve({timeout:true,label:label});},ms);})
  ]);
}
function sleep(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}
async function loadStep(label,fn,required){
  var delays=[0,650,1200],last=null;
  for(var i=0;i<delays.length;i++){
    if(delays[i]) await sleep(delays[i]);
    try{
      bootText((i?'Reintentando ':'Cargando ')+label+'...');
      var res=await withTimeout(fn(),7200,label);
      if(res&&res.timeout) throw new Error('Tiempo agotado');
      if(!res||res.error||res.ok===false) throw new Error((res&&res.error)||'Respuesta incompleta');
      return{ok:true,data:res,label:label};
    }catch(e){
      last=e;
      console.warn('Carga '+label+' intento '+(i+1),e);
    }
  }
  if(required) throw new Error('No se pudo cargar '+label);
  return{ok:false,label:label,error:last};
}

function stateOk(x){return x&&x.ok!==false&&!x.error&&!x.timeout;}
function aplicarInitialState(res,opts){
  opts=opts||{};
  if(!res||res.ok===false||res.timeout)return false;
  var homeMes=res.mesActual||opts.homeMes||G.mesActual||mesActualCalendario();
  var histMes=res.histMes||opts.histMes||G.histMes||homeMes;

  if(res.meses&&res.meses.length){
    G.meses=res.meses.slice();
    cacheSet('meses',G.meses);
  }else if(!G.meses||!G.meses.length){
    G.meses=[homeMes];
  }
  fillSels(G.meses);

  G.mesActual=homeMes;
  G.histMes=histMes;
  cacheSet('mesActual',homeMes);
  var sh=eid('sel-h');if(sh)sh.value=homeMes;
  var sp=eid('sel-pr');if(sp)sp.value=histMes;

  if(stateOk(res.home)){
    var home=aplicarSaldoEsperado(res.home,homeMes);
    G.mesData=home;
    renderHome(home);
  }
  if(stateOk(res.hist)){
    G.histData=res.hist;
    if(eid('page-presupuesto').classList.contains('active'))renderPresupuesto(res.hist);
  }else if(G.mesData&&histMes===homeMes){
    G.histData=G.mesData;
  }
  if(stateOk(res.movimientos)){
    G.movimientos=res.movimientos.data||[];
    G.movimientosMes=histMes;
    if(eid('page-presupuesto').classList.contains('active'))renderHistorialMovimientos();
  }
  if(stateOk(res.tarjetas)){
    G.tarjetas=res.tarjetas.tarjetas||[];
    prepararMesesTarjeta();
    if(stateOk(res.tdcMovs)){
      G.tdcMovs=res.tdcMovs.data||[];
      G.tdcMovsAplicados=stateOk(res.tdcMovsAplicados)?(res.tdcMovsAplicados.data||[]):[];
      G._tdcMovsReadyKey=res.tdcKey||'';
    }
    renderSelectorTarjeta();
    if(eid('page-tarjetas').classList.contains('active'))renderHistorialTarjeta();
  }
  if(stateOk(res.flujo)){
    G.flujo=res.flujo.data;
    if(eid('page-flujo').classList.contains('active'))renderFlujo(G.flujo);
  }
  if(stateOk(res.balance)){
    G.balance=res.balance;
    if(eid('page-balance').classList.contains('active'))renderBalance(G.balance);
  }
  if(stateOk(res.japon)){
    G.japon=res.japon;
    paintHomeJapon(res.japon);
    renderModalJapon(res.japon);
  }
  if(stateOk(res.pinturas)){
    G.pinturas=res.pinturas.data;
    cacheSetPinturas(homeMes,res.pinturas.data);
    paintHomePinturas(res.pinturas.data);
  }
  G._dirty=false;
  return true;
}

function aplicarPostChangeState(state){
  if(!state||state.ok===false)return false;
  var homeMes=state.homeMes||G.mesActual;
  var histMes=state.histMes||G.histMes||homeMes;
  if(state.home&&state.home.ok!==false&&!state.home.error){
    G.mesData=aplicarSaldoEsperado(state.home,homeMes);
    cacheSetBootHome(homeMes,G.mesData);
    cacheSet('lastGoodHome',{mes:homeMes,data:G.mesData});
    if(G.mesActual===homeMes)renderHome(G.mesData);
  }
  if(state.movimientos&&state.movimientos.ok){
    G.movimientos=state.movimientos.data||[];
    G.movimientosMes=histMes;
    cacheSetMovimientos(histMes,G.movimientos);
    if(G.histMes===histMes&&eid('page-presupuesto').classList.contains('active'))renderHistorialMovimientos();
  }
  if(state.tarjetas&&state.tarjetas.ok!==false){
    aplicarTarjetasState(state.tarjetas);
  }
  if(state.tdcMovs&&state.tdcMovs.ok){
    G.tdcMovs=state.tdcMovs.data||[];
    G.tdcMovsAplicados=stateOk(state.tdcMovsAplicados)?(state.tdcMovsAplicados.data||[]):G.tdcMovsAplicados||[];
    G._tdcMovsReadyKey=state.tdcKey||G._tdcMovsReadyKey;
    if(eid('page-tarjetas').classList.contains('active'))renderMovsTdc();
  }
  if(state.pinturas&&state.pinturas.ok){
    G.pinturas=state.pinturas.data;
    cacheSetPinturas(homeMes,state.pinturas.data);
    if(mesInicioActivo()===homeMes)paintHomePinturas(state.pinturas.data);
  }
  G._dirty=true;
  G._dirtyFlujo=true;
  G._dirtyBalance=true;
  return true;
}

document.addEventListener('DOMContentLoaded',function(){
  hydrateBootLogo();
  prepararHeaders();
  qsa('[data-page]').forEach(function(el){
    el.addEventListener('click',function(){navTo(el.dataset.page);});
  });
  var histPc=document.querySelector('#page-presupuesto .pc');
  if(histPc)histPc.addEventListener('scroll',actualizarFloatFechas,{passive:true});
  window.addEventListener('resize',actualizarFloatFechas);
  eid('m-fecha').value=todayISO();
  init();
});
function hydrateBootLogo(){
  var mark=eid('boot-mark');
  var icon=document.querySelector('link[rel="apple-touch-icon"]');
  if(!mark||!icon||!icon.href)return;
  mark.innerHTML='<img src="'+icon.href+'" alt="">';
}

function prepararHeaders(){
  var iso=document.querySelector('.sb-li img');
  if(!iso)return;
  qsa('.page:not(#page-home) .ph-l').forEach(function(h){
    if(h.querySelector('.header-iso'))return;
    var box=document.createElement('div');
    box.className='header-iso';
    var img=document.createElement('img');
    img.src=iso.src;
    img.alt='';
    box.appendChild(img);
    h.insertBefore(box,h.firstChild);
  });
}

function navTo(p){
  if(p==='japon'){
    navTo('home');
    abrirModalJapon();
    return;
  }
  qsa('.page').forEach(function(el){el.classList.remove('active');});
  var pg=eid('page-'+p);if(pg)pg.classList.add('active');
  qsa('[data-page]').forEach(function(el){el.classList.toggle('active',el.dataset.page===p);});
  eid('np').classList.remove('open');G.notifOpen=false;

  // Balance y flujo: recargar siempre si dirty, sino solo si no hay datos
  if(p==='balance'){
    if(G._dirtyBalance||!G.balance){G.balance=null;loadBalance();}
    else renderBalance(G.balance);
  }
  if(p==='flujo'){
    if(G._dirtyFlujo||!G.flujo){G.flujo=null;loadFlujo();}
    else renderFlujo(G.flujo);
  }
  if(p==='tarjetas'){
    if(G._dirtyTarjetas||!G.tarjetas){G.tarjetas=null;loadTarjetas();}
    else{renderSelectorTarjeta();renderHistorialTarjeta();}
  }
  if(p==='presupuesto'){
    if(G.histData&&G.histData.mes===G.histMes) renderPresupuesto(G.histData);
    else if(G.histMes) cambiarMesHistorial(G.histMes);
    else if(G.mesData) renderPresupuesto(G.mesData);
  }
  if(p==='calendario')             renderCalendario();
  setTimeout(actualizarFloatFechas,60);
}

function init(){
  var cachedMeses=cacheGet('meses');
  var cal=mesActualCalendario();
  if(cachedMeses&&cachedMeses.length){
    G.meses=cachedMeses.slice();
    if(G.meses.indexOf(cal)<0)G.meses.push(cal);
    G.mesActual=cal;
    fillSels(G.meses);
    G.histMes=G.histMes||G.mesActual;
    var sh=eid('sel-h');if(sh)sh.value=G.mesActual;
    var sp=eid('sel-pr');if(sp)sp.value=G.histMes;
  }
  preloadAppFast();
}

async function preloadAppFast(){
  var canHide=false,mes=mesActualCalendario(),slow=null;
  try{
    slow=setTimeout(function(){bootText('Leyendo datos reales...');},1200);
    bootText('Conectando con el libro...');

    var cachedMeses=G.meses&&G.meses.length?G.meses:(cacheGet('meses')||[]);
    if(cachedMeses.length){
      cachedMeses.sort(function(a,b){return mesOrdenNombre(a)-mesOrdenNombre(b);});
      G.meses=cachedMeses;
      if(G.meses.indexOf(mes)<0)G.meses.push(mes);
      fillSels(G.meses);
    }
    G.mesActual=mes;
    G.histMes=G.histMes||mes;
    var sh=eid('sel-h');if(sh)sh.value=G.mesActual;
    var sp=eid('sel-pr');if(sp)sp.value=G.histMes;
    cacheSet('mesActual',G.mesActual);

    if(window.__JAEGER_BRIDGE_RUNTIME){
      var direct=await preloadAppLegacy(mes);
      if(direct){
        canHide=true;
        clearTimeout(slow);
        bootText('Listo');
        return;
      }
    }

    bootText('Cargando inicio...');
    var boot=await withTimeout(gsRun('getBootState',[{
      homeMes:G.mesActual,
      histMes:G.histMes||G.mesActual
    }]),8500,'estado inicial');
    if(!boot||boot.timeout||boot.ok===false||boot.error){
      throw new Error((boot&&boot.error)||'No llegaron los datos iniciales');
    }
    aplicarInitialState(boot,{homeMes:boot.mesActual||G.mesActual,histMes:boot.histMes||G.histMes});
    if(G.mesData){
      cacheSetBootHome(G.mesActual,G.mesData);
      cacheSet('lastGoodHome',{mes:G.mesActual,data:G.mesData});
    }
    canHide=true;

    clearTimeout(slow);
    bootText('Listo');
    setTimeout(function(){
      cargarMovimientosMesBg(G.histMes||G.mesActual);
      cargarTarjetasState({mes:G.tcMesActual||G.mesActual,idx:G.tcIdx||0,anio:G.tdcAnio||2026},6500);
      preloadSecundario(G.mesActual,false);
    },120);
  }catch(e){
    if(slow)clearTimeout(slow);
    console.warn('preload fast',e);
    try{
      bootText('Intentando carga real directa...');
      var legacy=await preloadAppLegacy(mes);
      if(legacy){canHide=true;return;}
    }catch(legacyErr){
      console.warn('preload fast fallback',legacyErr);
    }
    bootText('No pude cargar datos reales. Revisa conexion y abre la app otra vez.');
    showToast('No pude cargar datos reales. Recarga la app.','err');
  }finally{
    if(canHide)setTimeout(function(){if(G.mesData)hideBootLoader();},260);
  }
}

async function preloadApp(){
  var canHide=false,slow=null,mes=mesActualCalendario(),paintedCached=false;
  try{
    slow=setTimeout(function(){bootText('Preparando datos...');},1200);
    bootText('Preparando datos...');
    var initial=await withTimeout(gsRun('getInitialState',[{
      homeMes:mes,
      histMes:mes,
      cardMes:mes,
      cardIdx:G.tcIdx||0,
      cardYear:G.tdcAnio||2026
    }]),18000,'estado inicial');
    if(!initial||initial.timeout||initial.ok===false||initial.error){
      throw new Error((initial&&initial.error)||'No llegó el estado inicial');
    }
    aplicarInitialState(initial,{homeMes:initial.mesActual||mes,histMes:initial.histMes||initial.mesActual||mes});
    mes=G.mesActual||initial.mesActual||mes;
    if(G.mesData){
      cacheSetBootHome(mes,G.mesData);
      cacheSet('lastGoodHome',{mes:mes,data:G.mesData});
    }
    clearTimeout(slow);
    bootText('Listo');
    canHide=true;
    setTimeout(function(){
      preloadSecundario(mes,false);
    },120);
  }catch(e){
    if(slow)clearTimeout(slow);
    console.warn('preload inicial',e);
    try{
      var legacy=await preloadAppLegacy(mes);
      if(legacy){canHide=true;return;}
    }catch(legacyErr){
      console.warn('preload legacy',legacyErr);
    }
    if((!G.meses||!G.meses.length)){
      G.meses=cacheGet('meses')||[mes];
      fillSels(G.meses);
    }
    mes=G.mesActual||getMesActual(G.meses);
    G.mesActual=mes;
    G.histMes=G.histMes||mes;
    var sh=eid('sel-h');if(sh)sh.value=mes;
    var sp=eid('sel-pr');if(sp)sp.value=G.histMes;
    var cached=cacheGetBootHome(mes);
    var last=cacheGet('lastGoodHome');
    if((!cached||!cached.vistaGeneral)&&last&&last.mes===mes&&last.data)cached=last.data;
    if(cached&&cached.vistaGeneral){
      G.mesData=cached;
      G.histData=cached;
      renderHome(cached);
      bootText('Entrando con datos guardados...');
      canHide=true;
      showToast('Entré con el último dato bueno. Actualizando...','ok');
      setTimeout(function(){
        refreshInicioBg(mes);
        syncTrasCambio({delay:700,mesInicio:mes,mesHist:mes,timeout:12000});
      },420);
    }else{
      bootText('No se pudo cargar el libro. Revisa conexión y recarga.');
      showToast('No se pudo cargar el libro. Recarga la app.','err');
      canHide=false;
    }
  }finally{
    if(canHide)setTimeout(function(){
      if(G.mesData)hideBootLoader();
    },260);
  }
}

async function preloadAppLegacy(mes){
  bootText('Cargando inicio...');
  var mesesRes=await withTimeout(gsRun('getMesesDisponibles'),6500,'meses');
  if(mesesRes&&mesesRes.ok&&mesesRes.data&&mesesRes.data.length){
    G.meses=mesesRes.data||[];
    cacheSet('meses',G.meses);
  }else{
    G.meses=(G.meses&&G.meses.length)?G.meses:(cacheGet('meses')||[]);
    if(!G.meses.length)G.meses=[mes];
  }
  fillSels(G.meses);
  mes=getMesActual(G.meses);
  G.mesActual=mes;
  G.histMes=mes;
  cacheSet('mesActual',mes);
  var sh=eid('sel-h');if(sh)sh.value=mes;
  var sp=eid('sel-pr');if(sp)sp.value=mes;
  var mesDataRes=await withTimeout(gsRun('getMesData',[mes]),12000,'inicio');
  if(!mesDataRes||mesDataRes.timeout||mesDataRes.ok===false||mesDataRes.error){
    throw new Error((mesDataRes&&mesDataRes.error)||'No llegaron los datos de inicio');
  }
  mesDataRes=aplicarSaldoEsperado(mesDataRes,mes);
  G.mesData=mesDataRes;
  G.histData=mesDataRes;
  cacheSetBootHome(mes,mesDataRes);
  cacheSet('lastGoodHome',{mes:mes,data:mesDataRes});
  renderHome(mesDataRes);
  setTimeout(function(){
    cargarMovimientosMesBg(mes);
    cargarTarjetasState({mes:mes,idx:G.tcIdx||0,anio:G.tdcAnio||2026},9000);
    preloadSecundario(mes,false);
  },120);
  return true;
}

function refreshInicioBg(mes){
  mes=mes||G.mesActual;
  if(!mes)return;
  gsRun('getMesData',[mes]).then(function(res){
    if(res&&res.ok!==false&&!res.error){
      res=aplicarSaldoEsperado(res,mes);
      G.mesData=res;
      cacheSetBootHome(mes,res);
      cacheSet('lastGoodHome',{mes:mes,data:res});
      if(G.mesActual===mes)renderHome(res);
    }
  }).catch(function(e){console.warn('inicio bg',e);});
  gsRun('getMesesDisponibles').then(function(res){
    if(res&&res.ok&&res.data&&res.data.length){G.meses=res.data.slice().sort(function(a,b){return mesOrdenNombre(a)-mesOrdenNombre(b);});cacheSet('meses',G.meses);fillSels(G.meses);}
  }).catch(function(e){console.warn('meses bg',e);});
}

function cargarMovimientosMesBg(mes){
  mes=mes||G.histMes||G.mesActual;
  if(!mes)return Promise.resolve(null);
  return withTimeout(gsRun('getMovimientosMes',[mes]),4200,'movimientos')
    .then(function(res){
      if(res&&res.ok){
        G.movimientos=res.data||[];
        G.movimientosMes=mes;
        cacheSetMovimientos(mes,G.movimientos);
        if(eid('page-presupuesto').classList.contains('active'))renderHistorialMovimientos();
      }
      return res;
    })
    .catch(function(e){console.warn('movimientos bg',e);return null;});
}

function preloadSecundario(mes,force){
  preloadSecundarioReady(mes,force,false);
}

function aplicarTarjetasState(res,fromCache){
  if(!res||res.ok===false||res.timeout)return false;
  G.tarjetas=res.tarjetas||[];
  G.tcIdx=parseInt(res.tcIdx,10)||0;
  G.tdcAnio=parseInt(res.tdcAnio,10)||G.tdcAnio||2026;
  G.tcMesActual=res.tcMesActual||G.tcMesActual||G.mesActual;
  G.tdcMovs=res.tdcMovs||[];
  G.tdcMovsAplicados=res.tdcMovsAplicados||[];
  G._tdcMovsReadyKey=res.tdcKey||((G.tarjetas[G.tcIdx]?G.tarjetas[G.tcIdx].id:'')+'|'+G.tcMesActual);
  prepararMesesTarjeta();
  renderSelectorTarjeta();
  renderHistorialTarjeta();
  G._dirtyTarjetas=false;
  if(!fromCache)cacheSetTarjetas({mes:G.tcMesActual,idx:G.tcIdx,anio:G.tdcAnio},res);
  return true;
}

function cargarTarjetasState(opts,ms){
  opts=opts||{};
  return withTimeout(gsRun('getTarjetasState',[opts]),ms||5600,'tarjetas')
    .then(function(res){
      if(!aplicarTarjetasState(res))console.warn('tarjetas incompletas',res);
      return res;
    })
    .catch(function(e){
      console.warn('tarjetas state',e);
      return withTimeout(gsRun('parseTarjetas'),ms||5600,'tarjetas base')
        .then(function(res){
          if(res&&res.ok){
            G.tarjetas=res.tarjetas||[];
            prepararMesesTarjeta();
            renderSelectorTarjeta();
            renderHistorialTarjeta();
          }
          return res;
        })
        .catch(function(err){console.warn('tarjetas fallback',err);return null;});
    });
}

async function preloadSecundarioReady(mes,force,showProgress){
  mes=mes||G.mesActual;
  if(!mes)return [];
  if(force){G.movimientosMes=null;G.tarjetas=null;G.flujo=null;G.balance=null;G.japon=null;G.pinturas=null;}
  var ligero=!force&&!showProgress;
  var jobs=[];
  function job(label,condition,promiseFactory,handler,ms){
    if(!condition)return;
    jobs.push(withTimeout(promiseFactory(),ms||2600,label).then(function(res){
      if(res&&res.timeout){console.warn('preload '+label+' timeout');return;}
      if(res&&res.ok!==false){handler(res);}
    }).catch(function(e){console.warn('preload '+label,e);}));
  }
  if(showProgress)bootText('Preparando historial...');
  job('historial',G.movimientosMes!==mes,function(){return cargarMovimientosMesBg(mes);},function(){},2400);
  job('tarjetas',!G.tarjetas,function(){return gsRun('getTarjetasState',[{mes:G.tcMesActual||mes,idx:G.tcIdx||0,anio:G.tdcAnio||2026}]);},function(res){
    aplicarTarjetasState(res);
  },2600);
  job('pinturas',!G.pinturas||G.pinturas.mes!==mes,function(){return gsRun('getPinturasMes',[mes]);},function(res){
    if(res&&res.ok){G.pinturas=res.data;cacheSetPinturas(mes,res.data);paintHomePinturas(res.data);}
  },2200);
  if(!ligero){
    job('flujo',!G.flujo,function(){return gsRun('getFlujoCaja');},function(res){
      if(res&&res.ok){G.flujo=res.data;if(eid('page-flujo').classList.contains('active'))renderFlujo(res.data);}
    },2600);
    job('balance',!G.balance,function(){return gsRun('getBalanceGeneral');},function(res){
      if(res&&res.ok){G.balance=res;if(eid('page-balance').classList.contains('active'))renderBalance(res);}
    },2600);
    job('japon',!G.japon,function(){return gsRun('getViajeJapon');},function(res){
      if(res&&res.ok){G.japon=res;paintHomeJapon(res);renderModalJapon(res);}
    },2200);
  }
  if(showProgress)bootText('Preparando páginas...');
  return Promise.allSettled(jobs);
}

var __syncTimer=null,__syncSeq=0;
function invalidarDatosCompartidos(){
  G.mesData=null;
  G.histData=null;
  G.movimientosMes=null;
  G.tarjetas=null;
  G.flujo=null;
  G.balance=null;
  G.japon=null;
  G.pinturas=null;
  G._dirty=true;
  G._dirtyFlujo=true;
  G._dirtyBalance=true;
  G._dirtyTarjetas=true;
}
function syncTrasCambio(opts){
  opts=opts||{};
  G._dirty=true;
  G._dirtyFlujo=true;
  G._dirtyBalance=true;
  if(opts.tarjetas)G._dirtyTarjetas=true;
  if(__syncTimer)clearTimeout(__syncTimer);
  __syncTimer=setTimeout(function(){
    var seq=++__syncSeq;
    var mesInicio=opts.mesInicio||opts.mes||G.mesActual||mesActualCalendario();
    var mesHist=opts.mesHist||G.histMes||mesInicio;
    var activeHome=eid('page-home').classList.contains('active');
    var activeHist=eid('page-presupuesto').classList.contains('active');
    var activeCards=eid('page-tarjetas').classList.contains('active');
    var activeFlujo=eid('page-flujo').classList.contains('active');
    var activeBalance=eid('page-balance').classList.contains('active');
    var jobs=[];
    function ok(res){return res&&res.ok!==false&&!res.error&&!res.timeout;}
    function job(label,promise,handler){
      jobs.push(promise.then(function(res){
        if(seq!==__syncSeq||!ok(res))return;
        handler(res);
      }).catch(function(e){console.warn('sync '+label,e);}));
    }
    if(opts.refreshMeses){
      job('meses',withTimeout(gsRun('getMesesDisponibles'),2800,'meses'),function(res){
        if(res.ok&&res.data&&res.data.length){G.meses=res.data;cacheSet('meses',G.meses);fillSels(G.meses);}
      });
    }
    job('inicio',withTimeout(gsRun('getMesData',[mesInicio]),4800,'inicio'),function(res){
      res=aplicarSaldoEsperado(res,mesInicio);
      cacheSetBootHome(mesInicio,res);
      cacheSet('lastGoodHome',{mes:mesInicio,data:res});
      if(G.mesActual===mesInicio){
        G.mesData=res;
        if(activeHome)renderHome(res);
      }
    });
    if(activeHist||opts.historial){
      job('movimientos',withTimeout(gsRun('getMovimientosMes',[mesHist]),4200,'movimientos'),function(res){
        if(res.ok){G.movimientos=res.data||[];G.movimientosMes=mesHist;cacheSetMovimientos(mesHist,G.movimientos);if(eid('page-presupuesto').classList.contains('active'))renderHistorialMovimientos();}
      });
    }
    if(activeCards||opts.tarjetas){
      job('tarjetas',withTimeout(gsRun('getTarjetasState',[{mes:G.tcMesActual||mesInicio,idx:G.tcIdx||0,anio:G.tdcAnio||2026}]),4800,'tarjetas'),function(res){
        aplicarTarjetasState(res);
      });
    }
    if(activeFlujo||opts.flujo){
      job('flujo',withTimeout(gsRun('getFlujoCaja'),4800,'flujo'),function(res){
        if(res.ok){G.flujo=res.data;G._dirtyFlujo=false;if(eid('page-flujo').classList.contains('active'))renderFlujo(res.data);}
      });
    }
    if(activeBalance||opts.balance){
      job('balance',withTimeout(gsRun('getBalanceGeneral'),4800,'balance'),function(res){
        if(res.ok){G.balance=res;G._dirtyBalance=false;if(eid('page-balance').classList.contains('active'))renderBalance(res);}
      });
    }
    if(activeHome||opts.pinturas){
      job('pinturas',withTimeout(gsRun('getPinturasMes',[mesInicio]),3200,'pinturas'),function(res){
        if(res.ok){G.pinturas=res.data;cacheSetPinturas(mesInicio,res.data);if(mesInicioActivo()===mesInicio)paintHomePinturas(res.data);}
      });
    }
    Promise.allSettled(jobs).then(function(){
      if(seq===__syncSeq&&activeFlujo&&activeBalance)G._dirty=false;
    });
  },opts.delay==null?90:opts.delay);
}

function fillSels(m){
  m=asegurarMesesCliente(m);
  var homeVal=G.mesActual||(eid('sel-h')&&eid('sel-h').value)||'';
  var histVal=G.histMes||(eid('sel-pr')&&eid('sel-pr').value)||homeVal;
  G.meses=m;
  var h=m.map(function(n){return'<option value="'+n+'">'+n+'</option>';}).join('');
  ['sel-h','sel-pr'].forEach(function(id){var el=eid(id);if(el)el.innerHTML=h;});
  var sh=eid('sel-h');
  if(sh&&homeVal&&m.indexOf(homeVal)>=0)sh.value=homeVal;
  var sp=eid('sel-pr');
  if(sp&&histVal&&m.indexOf(histVal)>=0)sp.value=histVal;
  var btn=eid('btn-nmes');if(btn)btn.style.display='none';
}

var __homeMonthSeq=0;
function cambiarMes(nombre){cambiarMesInicio(nombre);}
function cambiarMesInicio(nombre){
  if(!nombre)return;
  var requestSeq=++__homeMonthSeq;
  ++__syncSeq;
  G.mesActual=nombre;
  G.histMes=nombre;
  G.tcMesActual=nombre;
  G.tdcAnio=anioDesdeMesNombre(nombre);
  G.movimientosMes=null;
  G.pinturas=null;
  cacheSet('mesActual',nombre);
  var sh=eid('sel-h');if(sh)sh.value=nombre;
  var sp=eid('sel-pr');if(sp)sp.value=nombre;
  var cached=cacheGetBootHome(nombre);
  if(cached){
    G.mesData=cached;G.histData=cached;renderHome(cached);
    showToast('Mostrando '+nombre+'. Actualizando…','ok');
  }else{
    eid('h-hero').innerHTML='<div class="card empty-state">Cargando resumen de '+nombre+'...</div>';
    eid('h-ing-card').innerHTML='<div class="empty-state">Consultando ingresos, egresos y ahorros…</div>';
    eid('h-cats').innerHTML='<div class="empty-state">Cargando distribución del mes…</div>';
    eid('h-dev').innerHTML='';
  }
  gsRun('getMesData',[nombre]).then(function(res){
    if(requestSeq!==__homeMonthSeq||G.mesActual!==nombre)return;
    if(!res||res.ok===false||res.error)throw new Error((res&&res.error)||'Respuesta incompleta');
    if(res.mes&&res.mes!==nombre)throw new Error('El servidor devolvió '+res.mes+' en lugar de '+nombre);
    G.mesData=aplicarSaldoEsperado(res,nombre);
    G.histData=G.mesData;
    cacheSetBootHome(nombre,G.mesData);
    cacheSet('lastGoodHome',{mes:nombre,data:G.mesData});
    renderHome(G.mesData);
    showToast(nombre+' actualizado','ok');
  }).catch(function(e){
    if(requestSeq!==__homeMonthSeq||G.mesActual!==nombre)return;
    console.warn('mes inicio',e);
    if(cached){
      showToast('No pude actualizar '+nombre+'; conservé el último dato guardado','err');
    }else{
      eid('h-hero').innerHTML='<div class="card empty-state">No pude cargar '+nombre+'.<br><button class="btn bgh" style="margin-top:12px" onclick="cambiarMesInicio(\''+nombre+'\')">Reintentar</button></div>';
      eid('h-ing-card').innerHTML='';eid('h-cats').innerHTML='';eid('h-dev').innerHTML='';
      showToast('No pude cargar '+nombre,'err');
    }
  });
  withTimeout(gsRun('getTarjetasState',[{mes:nombre,idx:G.tcIdx||0,anio:anioDesdeMesNombre(nombre)}]),6500,'tarjetas de '+nombre)
    .then(function(res){
      if(requestSeq!==__homeMonthSeq||G.mesActual!==nombre)return;
      if(res&&res.ok!==false&&!res.timeout)aplicarTarjetasState(res);
    }).catch(function(e){console.warn('tarjetas del mes',e);});
}

function cambiarMesHistorial(nombre){
  if(!nombre)return;
  G.histMes=nombre;
  G.movimientosMes=null;
  var sp=eid('sel-pr');if(sp)sp.value=nombre;
  if(eid('page-presupuesto').classList.contains('active')){
    eid('tx-list').innerHTML='<div class="empty-state">Cargando movimientos de '+nombre+'...</div>';
  }
  Promise.all([
    gsRun('getMesData',[nombre]).catch(function(e){return{ok:false,error:e};}),
    gsRun('getMovimientosMes',[nombre]).catch(function(e){return{ok:false,error:e};})
  ]).then(function(pair){
    var mesData=pair[0],movs=pair[1];
    if(movs&&movs.ok){
      G.movimientos=movs.data||[];
      G.movimientosMes=nombre;
      cacheSetMovimientos(nombre,G.movimientos);
    }
    if(mesData&&mesData.ok!==false&&!mesData.error){
      G.histData=mesData;
      if(eid('page-presupuesto').classList.contains('active'))renderPresupuesto(mesData);
    }
    if(movs&&movs.ok){
      if(eid('page-presupuesto').classList.contains('active'))renderHistorialMovimientos();
    }else{
      showToast('No pude cargar movimientos de '+nombre,'err');
    }
  });
}

function renderHome(d){
  G.homeCatResumen=getCategoriasDetalle(d);
  var vg=d.vistaGeneral||{};
  var saldo=vg.saldoFinal?vg.saldoFinal.actual:0;
  var ing=d.ingresos?d.ingresos.totalActual:(vg.ingresos?vg.ingresos.actual:0);
  var necR=d.necesidades?d.necesidades.total:0;
  var desR=d.deseos?d.deseos.total:0;
  var deuR=d.deudas?d.deudas.total:0;
  var ahoR=d.ahorros?(d.ahorros.total||d.ahorros.totalCalculado||0):0;

  var h=new Date().getHours();
  var heroHTML='';
  var noche=h<5||h>=20;
  var tarde=h>=17&&h<20;
  var dia=h>=5&&h<17;

  // Colores de texto adaptativos según fondo
  var amtColor=noche?'#ffffff':'#0a1428';
  var greetClass=noche?'hero-night':(tarde?'hero-eve':'hero-day');
  var greetTxt=dia?'Buenos días':(tarde?'Buenas tardes':'Buenas noches');
  var heroDateLabel=d.mes||G.mesActual||todayFull();

  if(dia){
    heroHTML='<div class="hero-card hero-day tap-target mb14" onclick="irHistorialDesdeSaldo()" title="Ver historial de transacciones" style="border:1px solid rgba(255,255,255,0.7)">'
      +'<svg class="hero-bg" viewBox="0 0 400 168" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%">'
      +'<defs><linearGradient id="skyDay" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#b8dfff"/><stop offset="100%" stop-color="#e8f6ff"/></linearGradient></defs>'
      +'<rect width="400" height="168" fill="url(#skyDay)"/>'
      +'<circle cx="330" cy="36" r="30" fill="#FFD700" opacity="0.92"/>'
      +'<circle cx="330" cy="36" r="38" fill="#FFD700" opacity="0.15"/>'
      +'<g stroke="#FFD700" stroke-width="2.5" opacity="0.45"><line x1="330" y1="0" x2="330" y2="10"/><line x1="330" y1="62" x2="330" y2="72"/><line x1="292" y1="36" x2="282" y2="36"/><line x1="368" y1="36" x2="378" y2="36"/><line x1="303" y1="9" x2="296" y2="2"/><line x1="357" y1="63" x2="364" y2="70"/><line x1="303" y1="63" x2="296" y2="70"/><line x1="357" y1="9" x2="364" y2="2"/></g>'
      +'<g fill="white" opacity="0.88"><ellipse cx="75" cy="38" rx="38" ry="19"/><ellipse cx="52" cy="44" rx="24" ry="15"/><ellipse cx="102" cy="44" rx="24" ry="15"/></g>'
      +'<g fill="white" opacity="0.65"><ellipse cx="200" cy="28" rx="30" ry="15"/><ellipse cx="178" cy="34" rx="20" ry="12"/><ellipse cx="225" cy="34" rx="20" ry="12"/></g>'
      +'<ellipse cx="200" cy="182" rx="270" ry="65" fill="#4caf50"/>'
      +'<ellipse cx="200" cy="186" rx="250" ry="55" fill="#43a047"/>'
      +'<g opacity="0.55"><circle cx="55" cy="142" r="3" fill="#FFD700"/><circle cx="135" cy="148" r="2.5" fill="#ff9999"/><circle cx="225" cy="143" r="3" fill="#FFD700"/><circle cx="305" cy="146" r="2.5" fill="#ff9999"/><circle cx="365" cy="140" r="2" fill="#fff"/></g>'
      +'</svg>'
      +'<div class="hero-overlay"></div>'
      +'<div class="hero-content">'
      +'<div class="hero-greet">'+greetTxt+', <strong>Christian</strong></div>'
      +'<div class="hero-date">'+heroDateLabel+'</div>'
      +'<div class="hero-lbl">Saldo disponible</div>'
      +'<div class="hero-saldo"><span class="ah" style="color:'+amtColor+';text-shadow:0 1px 8px rgba(255,255,255,0.5)">'+fmt(saldo)+'</span>'
      +'<span class="saldo-change '+(saldo>=0?'pos':'neg')+'">'+(saldo>=0?'Positivo ✓':'Negativo')+'</span></div>'
      +'</div></div>';
  } else if(tarde){
    heroHTML='<div class="hero-card hero-eve tap-target mb14" onclick="irHistorialDesdeSaldo()" title="Ver historial de transacciones" style="border:1px solid rgba(255,220,100,0.25)">'
      +'<svg class="hero-bg" viewBox="0 0 400 168" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%">'
      +'<defs><linearGradient id="skyEve" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e8541a"/><stop offset="45%" stop-color="#f08a1e"/><stop offset="100%" stop-color="#f5cc40"/></linearGradient></defs>'
      +'<rect width="400" height="168" fill="url(#skyEve)"/>'
      +'<circle cx="200" cy="136" r="40" fill="#FFD700" opacity="0.75"/>'
      +'<circle cx="200" cy="136" r="52" fill="#FFD700" opacity="0.12"/>'
      +'<g fill="#FFE082" opacity="0.8"><ellipse cx="85" cy="52" rx="42" ry="20"/><ellipse cx="60" cy="58" rx="26" ry="16"/><ellipse cx="112" cy="58" rx="26" ry="16"/></g>'
      +'<g fill="#FFCC02" opacity="0.55"><ellipse cx="295" cy="42" rx="34" ry="16"/><ellipse cx="275" cy="48" rx="22" ry="13"/><ellipse cx="318" cy="48" rx="22" ry="13"/></g>'
      +'<ellipse cx="200" cy="182" rx="270" ry="60" fill="#2e7d32"/>'
      +'<ellipse cx="200" cy="186" rx="250" ry="50" fill="#388e3c"/>'
      +'</svg>'
      +'<div class="hero-overlay"></div>'
      +'<div class="hero-content">'
      +'<div class="hero-greet">'+greetTxt+', <strong>Christian</strong></div>'
      +'<div class="hero-date">'+heroDateLabel+'</div>'
      +'<div class="hero-lbl">Saldo disponible</div>'
      +'<div class="hero-saldo"><span class="ah" style="color:'+amtColor+';text-shadow:0 1px 8px rgba(255,255,255,0.4)">'+fmt(saldo)+'</span>'
      +'<span class="saldo-change '+(saldo>=0?'pos':'neg')+'">'+(saldo>=0?'Positivo ✓':'Negativo')+'</span></div>'
      +'</div></div>';
  } else {
    heroHTML='<div class="hero-card hero-night tap-target mb14" onclick="irHistorialDesdeSaldo()" title="Ver historial de transacciones" style="border:1px solid rgba(255,255,255,0.1)">'
      +'<svg class="hero-bg" viewBox="0 0 400 168" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%">'
      +'<defs><linearGradient id="skyNight" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#070e1a"/><stop offset="100%" stop-color="#0f1e38"/></linearGradient></defs>'
      +'<rect width="400" height="168" fill="url(#skyNight)"/>'
      +'<g fill="white"><circle cx="28" cy="18" r="1.1" opacity="0.9"/><circle cx="72" cy="10" r="1.4" opacity="0.8"/><circle cx="118" cy="28" r="0.9" opacity="0.7"/><circle cx="158" cy="14" r="1.7" opacity="0.9"/><circle cx="198" cy="7" r="1.1" opacity="0.6"/><circle cx="248" cy="20" r="1.4" opacity="0.85"/><circle cx="52" cy="43" r="0.9" opacity="0.65"/><circle cx="98" cy="52" r="1.2" opacity="0.6"/><circle cx="178" cy="38" r="0.9" opacity="0.75"/><circle cx="348" cy="16" r="1.4" opacity="0.9"/><circle cx="378" cy="33" r="1.1" opacity="0.65"/><circle cx="288" cy="11" r="0.9" opacity="0.8"/><circle cx="320" cy="55" r="1.1" opacity="0.5"/><circle cx="138" cy="60" r="0.8" opacity="0.55"/></g>'
      +'<circle cx="330" cy="38" r="28" fill="#FFF9C4" opacity="0.95"/>'
      +'<circle cx="344" cy="32" r="24" fill="#0f1e38"/>'
      +'<ellipse cx="200" cy="188" rx="285" ry="68" fill="#04150e"/>'
      +'<ellipse cx="90" cy="174" rx="150" ry="48" fill="#061a10"/>'
      +'<ellipse cx="320" cy="176" rx="140" ry="46" fill="#061a10"/>'
      +'</svg>'
      +'<div class="hero-content">'
      +'<div class="hero-greet">'+greetTxt+', <strong>Christian</strong></div>'
      +'<div class="hero-date">'+heroDateLabel+'</div>'
      +'<div class="hero-lbl">Saldo disponible</div>'
      +'<div class="hero-saldo"><span class="ah hero-night-amt" style="color:#fff;text-shadow:0 2px 12px rgba(0,0,0,0.4)">'+fmt(saldo)+'</span>'
      +'<span class="saldo-change '+(saldo>=0?'pos':'neg')+'">'+(saldo>=0?'Positivo ✓':'Negativo')+'</span></div>'
      +'</div></div>';
  }
  eid('h-hero').innerHTML=heroHTML;

  var ingPres=d.ingresos?d.ingresos.totalPresupuesto:(vg.ingresos?vg.ingresos.presupuesto:0);
  var ingPct=ingPres>0?Math.min((ing/ingPres)*100,100):0;
  var ingSt=ingPct>=100?'ok':ingPct>=70?'warn':'over';
  eid('h-ing-card').innerHTML=
    '<div class="home-month-row">'
    +'<div class="card p12 cr12"><div class="lup">Ingresos</div><div class="amd tok2">'+fmt(ing)+'</div></div>'
    +'<div class="card p12 cr12"><div class="lup">Egresos</div><div class="amd tov2">'+fmt(necR+desR+deuR)+'</div></div>'
    +'<div class="card p12 cr12"><div class="lup">Ahorros</div><div class="amd tokb">'+fmt(ahoR)+'</div></div>'
    +'</div>';

  var mt=d.metricas||{};
  var metaN=mt.necDeudas?mt.necDeudas.valEst*0.65:ing*0.325;
  var metaD=mt.deseos?mt.deseos.valEst:ing*0.30;
  var metaDeu=mt.necDeudas?mt.necDeudas.valEst*0.35:ing*0.175;
  var metaA=mt.ahorros?mt.ahorros.valEst:ing*0.20;

  var cats=[
    {t:'Necesidades',v:necR,meta:metaN,grad:'linear-gradient(135deg,#0062cc,#007AFF,#34AADC)',ic:'🏠',aho:false},
    {t:'Deseos',     v:desR,meta:metaD,grad:'linear-gradient(135deg,#8a3fbf,#AF52DE,#c97de8)',ic:'🎮',aho:false},
    {t:'Deudas',     v:deuR,meta:metaDeu,grad:'linear-gradient(135deg,#cc2a22,#FF3B30,#ff6b63)',ic:'💳',aho:false},
    {t:'Ahorros',    v:ahoR,meta:metaA,grad:'linear-gradient(135deg,#28a745,#34C759,#50d975)',ic:'🏦',aho:true}
  ];
  var pctDist=porcentajesDistribucion(cats);
  eid('h-cats').innerHTML='<div class="cat-grid">'
    +cats.map(function(cat,idx){
      var pct=cat.meta>0?Math.min((cat.v/cat.meta)*100,100):0;
      var pctIng=pctDist[idx]||0;
      var s2=cat.aho?(cat.v>=cat.meta?'ok':(cat.v>=cat.meta*0.85?'warn':'over')):st(cat.meta,cat.v);
      var sob=cat.meta-cat.v;
      return'<div class="cat-card" style="background:'+cat.grad+'" onclick="abrirModalCat(\''+cat.t+'\')">'
        +'<div><div class="cat-ic">'+cat.ic+'</div>'
        +'<div class="cat-name">'+cat.t+' '+pctIng+'% del mes</div>'
        +'<div class="cat-amt">'+fmt(cat.v)+'</div>'
        +'<div class="cat-sub">'+(s2==='over'&&!cat.aho?'↑ '+fmt(Math.abs(sob))+' excedido':s2==='ok'?'✓ en objetivo':fmt(Math.abs(sob))+' de margen')+'</div>'
        +'</div>'
        +'<div><div style="display:flex;justify-content:space-between;margin-bottom:4px">'
        +'<span style="font-size:10px;color:rgba(255,255,255,0.6)">de '+fmt(cat.meta)+'</span>'
        +'<span style="font-size:10px;color:rgba(255,255,255,0.92);font-weight:700">'+pct.toFixed(0)+'%</span>'
        +'</div>'
        +'<div class="cat-bar"><div class="cat-bar-fill" style="width:'+pct+'%"></div></div>'
        +'</div></div>';
    }).join('')+'</div>';

  var todos=(d.necesidades?d.necesidades.items:[]).concat(d.deseos?d.deseos.items:[]);
  var bien=todos.filter(function(i){return i.sobrante>0&&i.presupuesto>0;}).sort(function(a,b){return b.sobrante-a.sobrante;}).slice(0,5);
  var mal=todos.filter(function(i){return i.sobrante<0;}).sort(function(a,b){return a.sobrante-b.sobrante;}).slice(0,5);
  var totalAhorro=todos.reduce(function(a,i){return a+((i.sobrante>0&&i.presupuesto>0)?i.sobrante:0);},0);
  var totalSobregasto=todos.reduce(function(a,i){return a+(i.sobrante<0?Math.abs(i.sobrante):0);},0);
  eid('h-dev').innerHTML=
    '<div class="card lc quick-kpi" onclick="abrirModalKpi(\'ahorro\')"><div class="lup mb4">Ahorro mensual</div>'
    +'<span class="kpi-num tok2">'+fmt(totalAhorro)+'</span><div class="kpi-caption">'+(bien.length?bien.length+' subcategorías con margen':'sin ahorros destacados')+'</div>'
    +'</div>'
    +'<div class="card lc quick-kpi" onclick="abrirModalKpi(\'sobregasto\')"><div class="lup mb4">Sobregasto</div>'
    +'<span class="kpi-num '+(totalSobregasto>0?'tov2':'tok2')+'">'+fmt(totalSobregasto)+'</span><div class="kpi-caption">'+(mal.length?mal.length+' subcategorías excedidas':'todo en orden')+'</div>'
    +'</div>'
    +'<div id="home-paint-card" class="home-paint-card home-wide card tap-target" onclick="abrirModalPinturas()"><div><h3>Pinturas del Mes</h3><p>Toca para revisar ventas</p></div><div style="text-align:right;position:relative;z-index:1"><b class="tokb">$0.00</b><p>0 vendidas</p></div></div>'
    +'<div id="home-japan-card" class="home-japan-card home-wide card tap-target" onclick="abrirModalJapon()"><div><h3>Meta Jap&oacute;n</h3><p>Toca para revisar progreso</p><div class="home-japan-progress"><i style="width:0%"></i></div></div><div style="text-align:right;position:relative;z-index:1"><b class="tok2">$0.00</b><p style="font-size:12px;color:var(--t2)">0%</p></div></div>';
  loadHomePinturas();
  loadHomeJapon();

  G.kpiAhorro=bien;
  G.kpiSobregasto=mal;

  /*
  eid('h-dev').innerHTML=
    +(bien.length?bien.map(function(i){
      return'<div class="lr"><span class="t2">'+i.nombre+'</span>'
        +'<div class="fr g6"><span class="asm tok2">+'+fmt(i.sobrante)+'</span>'
        +'<button class="info-btn" onclick="showDesglose(\''+i.nombre+'\',this)">i</button>'
        +'<div class="desglose-panel" id="ds-'+i.nombre.replace(/\s/g,'-')+'"></div>'
        +'</div></div>';
    }).join(''):'<div style="font-size:12px;color:var(--t3)">Sin datos</div>')
    +'</div>'
    +(mal.length?mal.map(function(i){
      return'<div class="lr"><span class="t2">'+i.nombre+'</span>'
        +'<div class="fr g6"><span class="asm tov2">'+fmt(i.sobrante)+'</span>'
        +'<button class="info-btn" onclick="showDesglose(\''+i.nombre+'\',this)">i</button>'
        +'<div class="desglose-panel" id="ds-'+i.nombre.replace(/\s/g,'-')+'"></div>'
        +'</div></div>';
    }).join(''):'<div style="font-size:12px;color:var(--t3)">¡Todo en orden! ✓</div>')
    +'</div>';
  */

  eid('sb-s').textContent=fmt(saldo);
}

function aplicarMovimientoHomeLocal(params){
  if(!G.mesData||!params)return;
  var mesAplicado=params.mes||G.mesActual;
  var monto=moneyVal(params.monto);
  var sub=params.subcategoria;
  var tipo=params.tipo;
  if(mesAplicado===G.mesActual){
    if(tipo==='ingreso'&&G.mesData.ingresos){
      G.mesData.ingresos.totalActual=(G.mesData.ingresos.totalActual||0)+monto;
      if(G.mesData.ingresos.items)G.mesData.ingresos.items.forEach(function(i){if(nE(i.nombre)===nE(sub))i.actual=(i.actual||0)+monto;});
    }else{
      var key={necesidad:'necesidades',deseo:'deseos',deuda:'deudas',ahorro:'ahorros'}[tipo];
      var sec=key?G.mesData[key]:null;
      if(sec){
        if(sec.items)sec.items.forEach(function(i){
          if(nE(i.nombre)===nE(sub)){
            i.actual=(i.actual||0)+monto;
            i.sobrante=(i.presupuesto||i.préstamo||0)-i.actual;
          }
        });
        sec.total=(sec.total||sec.totalCalculado||0)+monto;
        if(key==='ahorros')sec.totalCalculado=sec.total;
      }
    }
  }
}
function actualizarSaldoVisiblePorCaja(params){
  var mesCaja=params.mesRegistro||mesDesdeFechaISO(params.fecha)||G.mesActual;
  var monto=parseFloat(String(params.monto||0).replace(',','.'))||0;
  var delta=params.tipo==='ingreso'?monto:-monto;
  actualizarSaldoVisibleDelta(mesCaja,delta);
}

function actualizarSaldoVisibleDelta(mesCaja,delta){
  mesCaja=mesCaja||G.mesActual;
  if(!G.mesData)return;
  var ordCaja=mesOrdenNombre(mesCaja),ordActual=mesOrdenNombre(G.mesActual);
  if(G.mesActual!==mesCaja&&!(ordCaja>=0&&ordActual>=0&&ordCaja<ordActual))return;
  var saldoNuevo=Math.round((getSaldoData(G.mesData)+delta+Number.EPSILON)*100)/100;
  setSaldoData(G.mesData,saldoNuevo);
  cacheSetBootHome(G.mesActual,G.mesData);
  cacheSet('lastGoodHome',{mes:G.mesActual,data:G.mesData});
  renderHome(G.mesData);
}

function movimientoOptimista(params,id,mesCaja){
  params=params||{};
  var fecha=params.fecha||todayISO();
  return{
    id:String(id||Date.now()),
    orden:Date.now(),
    timestamp:new Date().toISOString(),
    mes:params.mes,
    mesCaja:mesCaja||params.mesRegistro||mesDesdeFechaISO(fecha)||params.mes,
    tipo:params.tipo,
    categoria:params.categoria||params.tipo,
    subcategoria:params.subcategoria,
    monto:moneyVal(params.monto),
    fecha:fecha,
    fechaOrden:localDateMs(fecha),
    notas:params.notas||'',
    saldoDespues:null
  };
}

function insertarMovimientoOptimista(tx){
  if(!tx||tx.mes!==G.histMes)return;
  var movs=(G.movimientos||[]).filter(function(t){return String(t.id)!==String(tx.id);});
  movs.push(tx);
  G.movimientos=movs;
  G.movimientosMes=G.histMes;
  cacheSetMovimientos(G.histMes,G.movimientos);
  if(eid('page-presupuesto').classList.contains('active'))renderHistorialMovimientos();
}

function loadHomeJapon(){
  var el=eid('home-japan-card');if(!el)return;
  if(G.japon){paintHomeJapon(G.japon);return;}
  google.script.run
    .withSuccessHandler(function(res){
      if(!res||!res.ok)return;
      G.japon=res;
      var pct=Math.min(res.porcentaje||0,100);
      el.innerHTML='<div><h3>Meta Japón</h3><p>Toca para revisar progreso</p><div class="home-japan-progress"><i style="width:'+pct+'%"></i></div></div>'
        +'<div style="text-align:right;position:relative;z-index:1"><b class="tok2">'+fmt(res.totalActual||0)+'</b><p style="font-size:12px;color:var(--t2)">'+(res.porcentaje||0).toFixed(1)+'%</p></div>';
    })
    .getViajeJapon();
}

function paintHomeJapon(res){
  var el=eid('home-japan-card');if(!el||!res)return;
  var pct=Math.min(res.porcentaje||0,100);
  el.innerHTML='<div><h3>Meta Japón</h3><p>Toca para revisar progreso</p><div class="home-japan-progress"><i style="width:'+pct+'%"></i></div></div>'
    +'<div style="text-align:right;position:relative;z-index:1"><b class="tok2">'+fmt(res.totalActual||0)+'</b><p style="font-size:12px;color:var(--t2)">'+(res.porcentaje||0).toFixed(1)+'%</p></div>';
}

function calcPinturasData(raw){
  raw=raw||{};
  var inicial=Math.max(0,moneyVal(raw.stockInicial));
  var agregado=Math.max(0,moneyVal(raw.stockAgregado));
  var actual=Math.max(0,moneyVal(raw.stockActual));
  var autoconsumo=Math.max(0,moneyVal(raw.autoconsumo));
  var descuento=Math.max(0,moneyVal(raw.descuento));
  var vendidas=Math.max(0,inicial+agregado-actual);
  var ingresos=Math.round(((6.5*vendidas)-(2*autoconsumo)-(0.5*descuento)+Number.EPSILON)*100)/100;
  var costo=Math.round((4.5*vendidas+Number.EPSILON)*100)/100;
  var utilidad=Math.round((ingresos-costo+Number.EPSILON)*100)/100;
  return{mes:raw.mes||mesInicioActivo(),stockInicial:inicial,stockAgregado:agregado,stockActual:actual,autoconsumo:autoconsumo,descuento:descuento,vendidas:vendidas,ingresos:ingresos,costo:costo,utilidad:utilidad};
}

function paintHomePinturas(data){
  var el=eid('home-paint-card');if(!el)return;
  data=calcPinturasData(data||G.pinturas||{});
  el.innerHTML='<div><h3>Pinturas del Mes</h3><p>'+Math.round(data.vendidas||0)+' vendidas</p></div>'
    +'<div style="text-align:right;position:relative;z-index:1"><b class="tokb">'+fmt(data.ingresos||0)+'</b><p style="font-size:12px;color:var(--t2)">Utilidad '+fmt(data.utilidad||0)+'</p></div>';
}

function loadHomePinturas(){
  var mes=mesInicioActivo();
  if(G.pinturas&&G.pinturas.mes===mes){paintHomePinturas(G.pinturas);return;}
  var cached=cacheGetPinturas(mes);
  if(cached){G.pinturas=cached;paintHomePinturas(cached);}
  gsRun('getPinturasMes',[mes]).then(function(res){
    if(res&&res.ok){
      cacheSetPinturas(mes,res.data);
      if(mesInicioActivo()===mes){
        G.pinturas=res.data;
        paintHomePinturas(res.data);
      }
    }
  }).catch(function(e){console.warn('pinturas',e);});
}

function setPinturasEdit(on){
  G.pintEdit=!!on;
  ['inicial','agregado','actual','auto','desc'].forEach(function(k){
    var v=eid('paint-v-'+k),inp=eid('paint-'+k);
    if(v)v.style.display=on?'none':'block';
    if(inp)inp.style.display=on?'block':'none';
  });
  if(eid('paint-actions'))eid('paint-actions').style.display=on?'flex':'none';
  if(eid('paint-edit-btn'))eid('paint-edit-btn').style.display=on?'none':'flex';
  if(eid('paint-clear'))eid('paint-clear').style.display=on?'block':'none';
}

function renderPinturasModal(data){
  data=calcPinturasData(data||{});
  G.pinturasDraft=data;
  if(eid('paint-modal-mes'))eid('paint-modal-mes').textContent=data.mes;
  var map=[['inicial','stockInicial'],['agregado','stockAgregado'],['actual','stockActual'],['auto','autoconsumo'],['desc','descuento']];
  map.forEach(function(pair){
    var short=pair[0],key=pair[1],val=data[key]||0;
    var v=eid('paint-v-'+short),inp=eid('paint-'+short);
    if(v)v.textContent=String(val);
    if(inp)inp.value=val?String(val):'';
  });
  if(eid('paint-vendidas'))eid('paint-vendidas').textContent=String(data.vendidas||0);
  if(eid('paint-r-vendidas'))eid('paint-r-vendidas').textContent=String(data.vendidas||0);
  if(eid('paint-r-ingresos'))eid('paint-r-ingresos').textContent=fmt(data.ingresos||0);
  if(eid('paint-r-utilidad'))eid('paint-r-utilidad').textContent=fmt(data.utilidad||0);
}

function calcPinturasUI(){
  var data=calcPinturasData({
    mes:mesInicioActivo(),
    stockInicial:eid('paint-inicial')?eid('paint-inicial').value:0,
    stockAgregado:eid('paint-agregado')?eid('paint-agregado').value:0,
    stockActual:eid('paint-actual')?eid('paint-actual').value:0,
    autoconsumo:eid('paint-auto')?eid('paint-auto').value:0,
    descuento:eid('paint-desc')?eid('paint-desc').value:0
  });
  G.pinturasDraft=data;
  if(eid('paint-vendidas'))eid('paint-vendidas').textContent=String(data.vendidas||0);
  if(eid('paint-r-vendidas'))eid('paint-r-vendidas').textContent=String(data.vendidas||0);
  if(eid('paint-r-ingresos'))eid('paint-r-ingresos').textContent=fmt(data.ingresos||0);
  if(eid('paint-r-utilidad'))eid('paint-r-utilidad').textContent=fmt(data.utilidad||0);
  return data;
}

function abrirModalPinturas(){
  var mes=mesInicioActivo();
  var modal=eid('mov-pinturas');if(modal)modal.classList.add('open');
  if(G.pinturas&&G.pinturas.mes===mes){renderPinturasModal(G.pinturas);setPinturasEdit(false);return;}
  var cached=cacheGetPinturas(mes);
  if(cached){G.pinturas=cached;renderPinturasModal(cached);setPinturasEdit(false);}
  else{
  renderPinturasModal({mes:mes});
  setPinturasEdit(false);
  }
  gsRun('getPinturasMes',[mes]).then(function(res){
    if(res&&res.ok){
      cacheSetPinturas(mes,res.data);
      if(mesInicioActivo()===mes&&eid('mov-pinturas').classList.contains('open')){
        G.pinturas=res.data;
        renderPinturasModal(res.data);
      }
    }
  }).catch(function(){showToast('Error al cargar pinturas','err');});
}

function editarPinturas(){
  setPinturasEdit(true);
  setTimeout(function(){var inp=eid('paint-inicial');if(inp)inp.focus();},80);
}

function cancelarPinturas(){
  renderPinturasModal(G.pinturas||{mes:mesInicioActivo()});
  setPinturasEdit(false);
}

function guardarPinturas(){
  var data=calcPinturasUI();
  if(data.autoconsumo+data.descuento>data.vendidas){showToast('Detalle supera pinturas vendidas','err');return;}
  var btn=eid('paint-save');if(btn)btn.disabled=true;
  gsRun('guardarPinturasMes',[data]).then(function(res){
    if(!res||!res.ok){showToast((res&&res.error)||'No se pudo guardar','err');return;}
    G.pinturas=res.data;
    cacheSetPinturas(res.data.mes||data.mes,res.data);
    renderPinturasModal(res.data);
    setPinturasEdit(false);
    paintHomePinturas(res.data);
    showToast('Pinturas actualizadas','ok');
  }).catch(function(e){
    showToast(e&&e.message?e.message:'Error al guardar','err');
  }).finally(function(){if(btn)btn.disabled=false;});
}

function limpiarPinturas(){
  var mes=mesInicioActivo();
  if(!confirm('Limpiar pinturas de '+mes+'?'))return;
  var btn=eid('paint-clear');if(btn)btn.disabled=true;
  gsRun('limpiarPinturasMes',[mes]).then(function(res){
    if(!res||!res.ok){showToast((res&&res.error)||'No se pudo limpiar','err');return;}
    G.pinturas=res.data;
    cacheSetPinturas(res.data.mes||mes,res.data);
    renderPinturasModal(res.data);
    setPinturasEdit(false);
    paintHomePinturas(res.data);
    showToast('Pinturas limpiadas','ok');
  }).catch(function(e){
    showToast(e&&e.message?e.message:'Error al limpiar','err');
  }).finally(function(){if(btn)btn.disabled=false;});
}

function abrirModalKpi(tipo){
  var data=tipo==='ahorro'?(G.kpiAhorro||[]):(G.kpiSobregasto||[]);
  eid('kpi-modal-title').textContent=tipo==='ahorro'?'Ahorro mensual':'Sobregasto';
  eid('kpi-modal-sub').textContent=tipo==='ahorro'
    ?'Subcategorías donde estás gastando menos de lo presupuestado'
    :'Subcategorías donde estás excediendo el presupuesto';
  if(!data.length){eid('kpi-modal-list').innerHTML='<div class="empty-state">Sin datos para mostrar.</div>';}
  else eid('kpi-modal-list').innerHTML=data.map(function(i){
    var val=Math.abs(i.sobrante||0);
    return'<div class="kpi-detail-row"><span>'+i.nombre+'</span><strong class="'+(tipo==='ahorro'?'tok2':'tov2')+'">'+fmt(val)+'</strong></div>';
  }).join('');
  eid('mov-kpi').classList.add('open');
}

function showDesglose(nombre,btn){
  var pid='ds-'+nombre.replace(/\s/g,'-');
  var panel=eid(pid);if(!panel)return;
  if(panel.classList.contains('open')){panel.classList.remove('open');return;}
  panel.innerHTML='<div style="font-size:11px;color:var(--t3)">Cargando...</div>';
  panel.classList.add('open');
  google.script.run
    .withSuccessHandler(function(res){
      if(!res||!res.ok||!res.data.length){panel.innerHTML='<div style="font-size:11px;color:var(--t3)">Sin registros aún</div>';return;}
      panel.innerHTML=res.data.map(function(tx){
        var fl=tx.fecha?String(tx.fecha).split('T')[0]:'-';
        var fp=fl.split('-');if(fp.length===3)fl=fp[2]+'/'+fp[1]+'/'+fp[0];
        return'<div class="ds-row"><span style="color:var(--t2)">'+fl+(tx.notas?' · '+tx.notas:'')+'</span><span class="asm">'+fmt(tx.monto)+'</span></div>';
      }).join('')+'<div class="ds-row" style="font-weight:700"><span>Total</span><span class="asm">'+fmt(res.data.reduce(function(a,x){return a+x.monto;},0))+'</span></div>';
    })
    .getDesgloseSub(G.mesActual,nombre);
}

function renderTxs(){
  var el=eid('h-txs');
  if(!G.txs.length){el.innerHTML='<div style="color:var(--t3);font-size:13px;text-align:center;padding:8px">Sin movimientos esta sesión</div>';return;}
  el.innerHTML=G.txs.slice(-6).reverse().map(function(tx){
    var ic=ICONOS[tx.subcategoria]||ICONOS['default'];
    var pos=tx.tipo==='ingreso'||tx.tipo==='ahorro';
    return'<div class="tx"><div class="txi" style="background:'+(pos?'rgba(52,199,89,0.12)':'rgba(255,59,48,0.09)')+'">'+ic+'</div>'
      +'<div style="flex:1"><div class="txn">'+tx.subcategoria+'</div><div class="txd">'+tx.fecha+'</div></div>'
      +'<div class="txa '+(pos?'pos':'neg')+'">'+(pos?'+':'-')+fmt(tx.monto)+'</div></div>';
  }).join('');
}

function loadBalance(){
  google.script.run
    .withSuccessHandler(function(res){if(!res||!res.ok){showToast('Error balance','err');return;}G.balance=res;G._dirtyBalance=false;renderBalance(res);})
    .withFailureHandler(function(e){showToast('Error: '+e,'err');})
    .getBalanceGeneral();
}
function renderBalanceLog(items,targetId){
  var el=eid(targetId||'bal-log-modal-list');
  if(!el)return;
  items=items||[];
  if(!items.length){
    el.innerHTML='<div class="bal-log-title">Ultimos cambios</div><div style="font-size:12px;color:var(--t3)">Sin cambios registrados</div>';
    return;
  }
  el.innerHTML='<div class="bal-log-title">Ultimos cambios</div>'+items.map(function(x){
    var accion=x.accion||'cambio';
    var nombre=x.nombre||x.codigo||'Balance';
    var tipo=String(x.tipo||'').toLowerCase();
    var esPasivo=tipo.indexOf('pas')===0;
    var esEliminar=String(accion).toLowerCase().indexOf('elim')===0;
    var positivo=esPasivo?esEliminar:!esEliminar;
    var cls=positivo?'tok2':'tov2';
    var valor=esEliminar?(x.anterior||x.nuevo||0):(x.nuevo||0);
    return'<div class="bal-log-item"><span><b class="'+cls+'">'+hEsc(accion)+'</b> - '+hEsc(nombre)+'<em>'+hEsc(x.fecha||'')+' · '+hEsc(x.tipo||'')+'</em></span><strong class="'+cls+'">'+fmt(valor)+'</strong></div>';
  }).join('');
}
function balanceAllItems(){
  var d=G.balance||{};
  return (d.activos||[]).concat(d.pasivos||[]).filter(function(x){return x&&!x.esGrupo;});
}
function findBalanceItemLocal(codigo){
  return balanceAllItems().filter(function(x){return String(x.codigo)===String(codigo);})[0]||null;
}
function recalcularBalanceLocal(){
  if(!G.balance)return;
  function suma(lista){
    var total=0,grupo=null;
    (lista||[]).forEach(function(x){
      if(!x)return;
      if(x.esGrupo){grupo=x;grupo.valor=0;return;}
      if(grupo)grupo.valor+=Number(x.valor||0);
      total+=Number(x.valor||0);
    });
    return Math.round((total+Number.EPSILON)*100)/100;
  }
  G.balance.totalActivos=suma(G.balance.activos||[]);
  G.balance.totalPasivos=suma(G.balance.pasivos||[]);
  G.balance.patrimonioNeto=Math.round(((G.balance.totalActivos||0)-(G.balance.totalPasivos||0)+Number.EPSILON)*100)/100;
}
function aplicarBalanceImpactosLocal(impactos,monto){
  if(!G.balance||!impactos||!impactos.length)return;
  var changed=false;
  impactos.forEach(function(imp){
    var it=findBalanceItemLocal(imp.codigo);
    if(!it)return;
    it.valor=Math.round(((Number(it.valor||0)+Number(monto||0)*Number(imp.signo||0))+Number.EPSILON)*100)/100;
    changed=true;
  });
  if(changed){recalcularBalanceLocal();renderBalance(G.balance);}
}
function abrirBalanceItem(modo,codigo,tipo){
  try{
    if(!G.balance&&codigo){showToast('Cargando balance...','ok');loadBalance();return;}
    var item=codigo?findBalanceItemLocal(codigo):null;
    if(codigo&&!item){showToast('Item no encontrado','err');return;}
    var tipoItem=item?(item.tipo||tipo||'Activo'):(tipo||'Activo');
    G.balItem={modo:modo||'crear',codigo:codigo||''};
    eid('bal-item-title').textContent=item?'Editar item':'Agregar item';
    eid('bal-item-tipo').disabled=!!item;
    eid('bal-item-tipo').value=tipoItem;
    fillBalanceGrupoSelect('bal-item-grupo',tipoItem,item&&item.grupo);
    eid('bal-item-nombre').value=item?(item.nombre||''):'';
    eid('bal-item-valor').value=item?String(item.valor||0):'';
    eid('bal-item-nota').value='';
    eid('mov-bal-item').classList.add('open');
    setTimeout(function(){var n=eid('bal-item-nombre');if(n)n.focus();},120);
  }catch(e){
    console.error('abrirBalanceItem error',e);
    showToast('Error al abrir edición','err');
  }
}
function guardarBalanceItemUI(){
  var btn=eid('bal-item-save');
  var nombre=eid('bal-item-nombre').value.trim();
  var valor=moneyVal(eid('bal-item-valor').value);
  if(!nombre){showToast('Escribe el nombre','err');return;}
  var params={
    codigo:G.balItem&&G.balItem.codigo,
    tipo:eid('bal-item-tipo').value,
    nombre:nombre,
    grupo:eid('bal-item-grupo').value,
    valor:String(valor),
    nota:eid('bal-item-nota').value||''
  };
  btn.disabled=true;btn.textContent='Guardando...';
  google.script.run
    .withSuccessHandler(function(res){
      btn.disabled=false;btn.textContent='Guardar';
      if(!res||!res.ok){showToast('Error: '+(res&&res.error?res.error:'desconocido'),'err');return;}
      eid('mov-bal-item').classList.remove('open');
      if(res.balance){G.balance=res.balance;G._dirtyBalance=false;renderBalance(res.balance);}
      else syncTrasCambio({delay:80,balance:true});
      showToast(params.codigo?'Balance actualizado':'Item agregado','ok');
    })
    .withFailureHandler(function(e){btn.disabled=false;btn.textContent='Guardar';showToast('Error: '+e,'err');})
    .guardarBalanceItem(params);
}
function renderBalance(d){
  eid('b-pat').textContent=fmt(d.patrimonioNeto||0);
  eid('b-act-t').textContent=fmt(d.totalActivos||0);
  eid('b-pas-t').textContent=fmt(d.totalPasivos||0);

  function renderListaBalance(lista,tipo){
    var html='',grupoActual=null,itemsGrupo=[],isActivo=tipo==='Activo';
    function visibleItem(x){return x&&(x.valor!==0||x.manual);}
    function flushGrupo(){
      if(!grupoActual)return;
      var items=itemsGrupo.filter(visibleItem);
      if(items.length||grupoActual.valor!==0){
        var gid=(isActivo?'ag':'pg')+String(grupoActual.codigo||grupoActual.nombre).replace(/\W/g,'');
        html+='<div class="bal-titulo fb" onclick="tgC(\''+gid+'\')" style="cursor:pointer;user-select:none">'
          +'<span>'+hEsc(grupoActual.nombre)+'</span>'
          +'<span style="color:'+(isActivo?'var(--ok)':'var(--over)')+';font-weight:700;font-family:-apple-system,BlinkMacSystemFont,Helvetica Neue,Arial,sans-serif;font-size:13px">'+fmt(grupoActual.valor)+'</span>'
          +'</div><div id="'+gid+'" style="display:block">';
        html+=items.map(function(x){
          return'<div class="bal-edit-row" style="padding-left:20px">'
            +'<div class="bal-row-main"><div class="bn2" style="font-weight:500;font-size:13px">'+hEsc(x.nombre)+'</div></div>'
            +(G.balEdit?'<div class="bal-actions"><div class="bal-val '+(isActivo?'tok2':'tov2')+'">'+fmt(x.valor)+'</div><button class="bal-edit-btn" title="Subir" onclick="moverBalanceItem(\''+x.codigo+'\',-1)">↑</button><button class="bal-edit-btn" title="Bajar" onclick="moverBalanceItem(\''+x.codigo+'\',1)">↓</button><button class="bal-edit-btn" title="Editar" onclick="abrirBalanceItem(\'editar\',\''+x.codigo+'\')">✎</button><button class="bal-del" title="Inactivar" onclick="deleteBalance(\''+x.codigo+'\')">x</button></div>'
              :'<div class="bal-val '+(isActivo?'tok2':'tov2')+'">'+fmt(x.valor)+'</div>')
            +'</div>';
        }).join('');
        html+='</div>';
      }
      grupoActual=null;itemsGrupo=[];
    }
    (lista||[]).forEach(function(x){
      if(x.esGrupo){flushGrupo();grupoActual=x;itemsGrupo=[];}
      else itemsGrupo.push(x);
    });
    flushGrupo();
    return html;
  }
  eid('b-act-list').innerHTML=renderListaBalance(d.activos||[],'Activo');
  eid('b-pas-list').innerHTML=renderListaBalance(d.pasivos||[],'Pasivo');
}


function abrirBalanceLog(){
  if(G.balance){
    renderBalanceLog(G.balance.cambios||[],'bal-log-modal-list');
    eid('mov-bal-log').classList.add('open');
    return;
  }
  renderBalanceLog([],'bal-log-modal-list');
  eid('mov-bal-log').classList.add('open');
  google.script.run
    .withSuccessHandler(function(res){
      if(res&&res.ok){G.balance=res;renderBalanceLog(res.cambios||[],'bal-log-modal-list');}
    })
    .getBalanceGeneral();
}
function tgBalEdit(){G.balEdit=!G.balEdit;if(G.balance)renderBalance(G.balance);showToast(G.balEdit?'Modo edición':'Cambios guardados','ok');}
function saveBalance(codigo,valor){
  abrirBalanceItem('editar',codigo);
}
function moverBalanceItem(codigo,dir){
  var item=findBalanceItemLocal(codigo);
  if(!item){showToast('Item no encontrado','err');return;}
  showToast('Moviendo...','ok');
  google.script.run
    .withSuccessHandler(function(res){
      if(res&&res.ok){
        if(res.balance){G.balance=res.balance;G._dirtyBalance=false;renderBalance(res.balance);}
        else syncTrasCambio({delay:80,balance:true});
      }else showToast((res&&res.error)||'No se pudo mover','err');
    })
    .withFailureHandler(function(e){showToast('Error: '+e,'err');})
    .moverBalanceItemOrden({codigo:codigo,dir:dir});
}
function deleteBalance(codigo){
  var nota=prompt('Motivo para eliminar/ocultar:');
  if(nota===null)return;
  if(!confirm('Ocultar este activo/pasivo del balance?'))return;
  google.script.run
    .withSuccessHandler(function(res){if(res&&res.ok){showToast('Eliminado','ok');if(res.balance){G.balance=res.balance;G._dirtyBalance=false;renderBalance(res.balance);}else syncTrasCambio({delay:80,balance:true});}else showToast('Error','err');})
    .eliminarBalanceItem({codigo:codigo,nota:nota||''});
}

function loadFlujo(){
  google.script.run
    .withSuccessHandler(function(res){if(!res||!res.ok){showToast('Error flujo','err');return;}G.flujo=res.data;G._dirtyFlujo=false;renderFlujo(res.data);})
    .withFailureHandler(function(e){showToast('Error: '+e,'err');})
    .getFlujoCaja();
}

var chartJsPromise=null;
function ensureChartJs(){
  if(window.Chart)return Promise.resolve(window.Chart);
  if(chartJsPromise)return chartJsPromise;
  chartJsPromise=new Promise(function(resolve,reject){
    var script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    script.async=true;
    script.onload=function(){if(window.Chart)resolve(window.Chart);else reject(new Error('Chart.js no disponible'));};
    script.onerror=function(){
      chartJsPromise=null;
      reject(new Error('No se pudo cargar la gráfica'));
    };
    document.head.appendChild(script);
  });
  return chartJsPromise;
}

function renderFlujo(d){
  if(!d)return;
  var get=function(lbl){return d.filas.filter(function(x){return x.label===lbl;})[0]||null;};
  var ing=get('TOTAL INGRESOS'),egr=get('TOTAL EGRESOS'),op=get('FLUJO OPERATIVO'),ac=get('FLUJO DE CAJA ACUMULADO'),si=get('SALDO INICIAL');

  eid('fl-tots').innerHTML=[
    {l:'Total Ingresos',v:ing?ing.total:0,c:'var(--ok)'},
    {l:'Total Egresos', v:egr?egr.total:0,c:'var(--over)'},
    {l:'Flujo Operativo',v:op?op.total:0,c:'var(--blue)'},
    {l:'Saldo Acumulado',v:ac?ac.valores[4]||0:0,c:'var(--purple)'}
  ].map(function(c){return'<div class="card fyc"><div class="lup">'+c.l+'</div><div class="fyv" style="color:'+c.c+'">'+fmt(c.v)+'</div></div>';}).join('');

  var ingArr=ing?ing.valores:d.meses.map(function(){return 0;});
  var egrArr=egr?egr.valores:d.meses.map(function(){return 0;});
  function drawFlujoChart(){
    var canvas=eid('ch-flujo');
    if(!canvas||!window.Chart)return;
    var ctx1=canvas.getContext('2d');
    if(G.chFlujo)G.chFlujo.destroy();
    G.chFlujo=new window.Chart(ctx1,{type:'bar',data:{labels:d.meses,datasets:[
      {label:'Ingresos',data:ingArr,backgroundColor:'rgba(52,199,89,0.55)',borderColor:'rgba(52,199,89,0.85)',borderWidth:1.5,borderRadius:5},
      {label:'Egresos', data:egrArr,backgroundColor:'rgba(255,59,48,0.45)',borderColor:'rgba(255,59,48,0.75)',borderWidth:1.5,borderRadius:5}
    ]},options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'rgba(0,0,0,0.45)',font:{size:11}}},tooltip:{callbacks:{label:function(c){return' '+fmt(c.parsed.y);}}}},
      scales:{x:{ticks:{color:'rgba(0,0,0,0.38)',font:{size:10}},grid:{color:'rgba(0,0,0,0.035)'}},
              y:{ticks:{color:'rgba(0,0,0,0.38)',callback:function(v){return'$'+v;},font:{size:10}},grid:{color:'rgba(0,0,0,0.04)'}}}}});
  }
  if(window.Chart)drawFlujoChart();
  else ensureChartJs()
    .then(function(){if(G.flujo===d)drawFlujoChart();})
    .catch(function(){showToast('No se pudo cargar la gráfica','err');});

  function tdV(v,cls,bold){
    return'<td style="text-align:right;padding:7px 8px;font-family:-apple-system,BlinkMacSystemFont,Helvetica Neue,Arial,sans-serif;font-size:11px;'
      +(bold?'font-weight:700;':'')+(v!==0?'color:'+cls+';':'color:var(--t3);')
      +'white-space:nowrap;border-bottom:0.5px solid rgba(0,0,0,0.04)">'+(v!==0?fmt(v):'-')+'</td>';
  }
  function tdTot(v,cls){
    return'<td style="text-align:right;padding:7px 10px;font-family:-apple-system,BlinkMacSystemFont,Helvetica Neue,Arial,sans-serif;font-size:11px;font-weight:700;color:'+cls+';white-space:nowrap;border-bottom:0.5px solid rgba(0,0,0,0.04);border-left:1px solid rgba(0,0,0,0.05)">'+fmt(v)+'</td>';
  }
  var hdr='<thead><tr>'
    +'<th style="text-align:left;padding:8px 12px;font-size:9px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--t3);border-bottom:2px solid rgba(0,0,0,0.07);white-space:nowrap;width:132px;min-width:132px;max-width:132px;position:sticky;left:0;background:#fff;z-index:3">Concepto</th>'
    +d.meses.map(function(m){return'<th style="text-align:right;padding:7px 8px;font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--t3);border-bottom:2px solid rgba(0,0,0,0.07);white-space:nowrap;min-width:62px">'+m+'</th>';}).join('')
    +'<th style="text-align:right;padding:7px 10px;font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--t3);border-bottom:2px solid rgba(0,0,0,0.07);white-space:nowrap;border-left:1px solid rgba(0,0,0,0.05);min-width:72px">Total</th>'
    +'</tr></thead>';

  var tbody='<tbody>';
  function trSec(label,color,bg){return'<tr><td colspan="'+(d.meses.length+2)+'" style="padding:6px 12px;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:'+color+';background:'+bg+';border-bottom:1px solid rgba(0,0,0,0.05)">'+label+'</td></tr>';}
  function trData(label,f,cls,bg,bold){
    if(!f)return'';
    var tot=f.valores.reduce(function(a,v){return a+v;},0);
    var bgSt=bg?bg:'rgba(255,255,255,0.92)';
    return'<tr style="background:'+(bg||'')+'">'
      +'<td style="padding:'+(bold?'7px 12px':'7px 12px 7px 16px')+';font-size:11px;font-weight:'+(bold?'700':'500')+';color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-bottom:0.5px solid rgba(0,0,0,0.04);position:sticky;left:0;background:'+(bg?bg:'#fff')+';z-index:2;width:132px;min-width:132px;max-width:132px">'+label+'</td>'
      +f.valores.map(function(v){return tdV(v,cls,bold);}).join('')
      +tdTot(f.total||tot,cls)+'</tr>';
  }

  if(si){
    tbody+='<tr style="background:rgba(0,122,255,0.03)">'
      +'<td style="padding:8px 12px;font-size:11px;font-weight:700;color:var(--blue);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-bottom:1px solid rgba(0,0,0,0.06);position:sticky;left:0;background:#eaf6ff;z-index:2;width:132px;min-width:132px;max-width:132px">Saldo Inicial</td>'
      +si.valores.map(function(v){return tdV(v,'var(--blue)',true);}).join('')
      +tdTot(si.total,'var(--blue)')+'</tr>';
  }

  tbody+=trSec('Ingresos','var(--ok)','rgba(52,199,89,0.03)');
  tbody+=trData('Sueldo',get('SUELDO'),'var(--ok)','');
  tbody+=trData('Pinturas',get('PINTURAS'),'var(--ok)','');
  tbody+=trData('Otros ingresos',get('OTROS INGRESOS'),'var(--ok)','');
  if(ing)tbody+=trData('Total Ingresos',ing,'var(--ok)','rgba(52,199,89,0.05)',true);

  tbody+=trSec('Egresos','var(--over)','rgba(255,59,48,0.03)');
  tbody+=trData('Necesidades',get('NECESIDADES'),'var(--over)','');
  tbody+=trData('Deseos',get('DESEOS'),'var(--over)','');
  tbody+=trData('Deudas',get('DEUDAS'),'var(--over)','');
  tbody+=trData('Ahorros',get('AHORROS'),'var(--ok)','');
  if(egr)tbody+=trData('Total Egresos',egr,'var(--over)','rgba(255,59,48,0.05)',true);

  if(op){
    tbody+='<tr style="background:rgba(0,122,255,0.04)">'
      +'<td style="padding:8px 12px;font-size:11px;font-weight:700;color:var(--blue);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-bottom:1px solid rgba(0,0,0,0.05);position:sticky;left:0;background:#eaf6ff;z-index:2;width:132px;min-width:132px;max-width:132px">Flujo Operativo</td>'
      +op.valores.map(function(v){return tdV(v,v>=0?'var(--ok)':'var(--over)',true);}).join('')
      +tdTot(op.total,op.total>=0?'var(--ok)':'var(--over)')+'</tr>';
  }
  if(ac){
    tbody+='<tr style="background:rgba(175,82,222,0.04)">'
      +'<td style="padding:8px 12px;font-size:11px;font-weight:700;color:var(--purple);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-bottom:none;position:sticky;left:0;background:#f2eafb;z-index:2;width:132px;min-width:132px;max-width:132px">Flujo Acumulado</td>'
      +ac.valores.map(function(v){return'<td style="text-align:right;padding:7px 8px;font-family:-apple-system,BlinkMacSystemFont,Helvetica Neue,Arial,sans-serif;font-size:11px;font-weight:700;color:'+(v>=0?'var(--ok)':'var(--over)')+';white-space:nowrap;border-bottom:none">'+fmt(v)+'</td>';}).join('')
      +'<td style="text-align:right;padding:7px 10px;font-family:-apple-system,BlinkMacSystemFont,Helvetica Neue,Arial,sans-serif;font-size:11px;font-weight:700;color:var(--purple);white-space:nowrap;border-left:1px solid rgba(0,0,0,0.05)">'+fmt(ac.valores[ac.valores.length-1])+'</td>'
      +'</tr>';
  }
  tbody+='</tbody>';
  eid('fl-tabla').innerHTML='<div class="fl-table-wrap"><table>'+hdr+tbody+'</table></div>';
}

function renderPresupuesto(d){
  if(!d)return;
  G.histMes=d.mes||G.histMes||G.mesActual;
  var sp=eid('sel-pr');if(sp)sp.value=G.histMes;
  eid('pr-sub').textContent=(d.mes||G.histMes||'-')+' · Registro';
  G.histCatResumen=getCategoriasDetalle(d);
  if(G.movimientosMes===G.histMes)renderHistorialMovimientos();
  else loadMovimientosMes();
}

function irHistorialDesdeSaldo(){
  G.histFiltroTipo='todos';
  G.histFiltroCat='todos';
  navTo('presupuesto');
  actualizarChipsHistorial();
}

function loadMovimientosMes(){
  var mes=G.histMes||G.mesActual;
  if(!mes)return;
  var cached=cacheGetMovimientos(mes);
  if(cached){
    G.movimientos=cached;
    G.movimientosMes=mes;
    renderHistorialMovimientos();
  }else{
    eid('tx-list').innerHTML='<div class="empty-state">Cargando movimientos...</div>';
  }
  withTimeout(gsRun('getMovimientosMes',[mes]),8500,'movimientos').then(function(res){
    if(!res||res.timeout||!res.ok){showToast('Error historial','err');return;}
    G.movimientos=res.data||[];
    G.movimientosMes=mes;
    cacheSetMovimientos(mes,G.movimientos);
    renderHistorialMovimientos();
  }).catch(function(e){
    console.warn('historial directo',e);
    showToast('Error historial','err');
  });
}

function renderHistorialMovimientos(){
  var txs=G.movimientos||[];
  var ing=0,egr=0,aho=0;
  txs.forEach(function(t){
    var m=parseFloat(t.monto)||0;
    if(t.tipo==='ingreso') ing+=m;
    else if(t.tipo==='ahorro') aho+=m;
    else if(esEgresoTipo(t.tipo)) egr+=m;
  });
  actualizarChipsHistorial();
  eid('tx-resumen').innerHTML=[
    {l:'Ingresos',v:ing,c:'var(--ok)'},
    {l:'Egresos',v:egr,c:'var(--over)'},
    {l:'Ahorros',v:aho,c:'var(--blue)'}
  ].map(function(r){
    return'<div class="card p12 cr12"><div class="lup">'+r.l+'</div><div class="amd" style="color:'+r.c+'">'+fmt(r.v)+'</div></div>';
  }).join('');
  txs=ordenarHistorial(filtrarHistorial(txs));
  if(!txs.length){
    eid('tx-list').innerHTML='<div class="card cr12 empty-state">Sin movimientos para el filtro seleccionado.</div>';
    actualizarFloatFechas();
    return;
  }
  eid('tx-list').innerHTML=txs.map(function(t){
    var pos=t.tipo==='ingreso'||t.tipo==='ahorro';
    var col=t.tipo==='ingreso'?'var(--ok)':t.tipo==='ahorro'?'var(--blue)':'var(--over)';
    var ic=t.tipo==='ingreso'?'↑':t.tipo==='ahorro'?'$':'↓';
    var icCls=t.tipo==='ingreso'?'ing':t.tipo==='ahorro'?'aho':'egr';
    var notas=t.notas?' · '+t.notas:'';
    var saldoInfo=(t.saldoDespues!==undefined&&t.saldoDespues!==null)?fmt(t.saldoDespues):'';
    return'<div class="hist-row" onclick="abrirDetalleHistorial(\''+t.id+'\')">'
      +'<div class="hist-ic '+icCls+'">'+ic+'</div>'
      +'<div class="hist-main"><div class="hist-title">'+t.subcategoria+'</div>'
      +'<div class="hist-meta">'+fmtFecha(t.fecha)+' · '+tipoLabel(t.tipo)+notas+'</div></div>'
      +'<div class="hist-side"><div class="hist-amt" style="color:'+col+'">'+(pos?'+':'-')+fmt(t.monto)+'</div>'
      +(saldoInfo?'<div class="hist-balance">'+saldoInfo+'</div>':'')+'</div></div>';
  }).join('');
  actualizarFloatFechas();
}

function abrirDetalleHistorial(id){
  var tx=(G.movimientos||[]).filter(function(t){return String(t.id)===String(id);})[0];
  if(!tx)return;
  var col=tx.tipo==='ingreso'?'tok2':tx.tipo==='ahorro'?'tokb':'tov2';
  eid('hist-detail-title').textContent=tx.subcategoria||'Movimiento';
  eid('hist-detail-body').innerHTML=
    '<div class="detail-line"><span>Tipo</span><strong>'+tipoLabel(tx.tipo)+'</strong></div>'
    +'<div class="detail-line"><span>Monto</span><strong class="'+col+'">'+fmt(tx.monto)+'</strong></div>'
    +'<div class="detail-line"><span>Fecha</span><strong>'+fmtFecha(tx.fecha)+'</strong></div>'
    +'<div class="detail-line"><span>Nota</span><strong>'+(tx.notas||'-')+'</strong></div>'
    +'<div class="detail-line"><span>Saldo después</span><strong>'+((tx.saldoDespues!==undefined&&tx.saldoDespues!==null)?fmt(tx.saldoDespues):'-')+'</strong></div>';
  eid('hist-detail-edit').onclick=function(){eid('mov-hist-detail').classList.remove('open');abrirEditarTx(id);};
  eid('hist-detail-delete').onclick=function(){eid('mov-hist-detail').classList.remove('open');abrirEliminarTx(id);};
  eid('mov-hist-detail').classList.add('open');
}

function setHistFilter(grupo,valor,el){
  if(grupo==='tipo'){
    G.histFiltroTipo=valor;
    if(valor!=='egreso') G.histFiltroCat='todos';
  }else{
    G.histFiltroCat=valor;
    if(valor!=='todos') G.histFiltroTipo='egreso';
  }
  actualizarChipsHistorial();
  renderHistorialMovimientos();
}

function actualizarChipsHistorial(){
  var tipo=G.histFiltroTipo||'todos',cat=G.histFiltroCat||'todos';
  var tipoBox=eid('tx-filter-tipo'),catBox=eid('tx-filter-cat');
  if(tipoBox) Array.prototype.forEach.call(tipoBox.querySelectorAll('.filter-chip'),function(b){b.classList.toggle('active',b.dataset.filter===tipo);});
  if(catBox){
    catBox.classList.toggle('open',tipo==='egreso');
    Array.prototype.forEach.call(catBox.querySelectorAll('.filter-chip'),function(b){b.classList.toggle('active',b.dataset.filter===cat);});
  }
}


function abrirFiltroFechas(){
  eid('hist-fecha-ini').value=G.histFechaIni||'';
  eid('hist-fecha-fin').value=G.histFechaFin||'';
  eid('mov-date-filter').classList.add('open');
}
function aplicarFiltroFechas(){
  G.histFechaIni=eid('hist-fecha-ini').value||'';
  G.histFechaFin=eid('hist-fecha-fin').value||'';
  eid('mov-date-filter').classList.remove('open');
  renderHistorialMovimientos();
}
function limpiarFiltroFechas(){
  G.histFechaIni='';G.histFechaFin='';
  eid('hist-fecha-ini').value='';eid('hist-fecha-fin').value='';
  eid('mov-date-filter').classList.remove('open');
  renderHistorialMovimientos();
}
function toggleHistOrden(){
  G.histOrden=G.histOrden==='antiguos'?'recientes':'antiguos';
  var b=eid('hist-order-btn');if(b)b.textContent=G.histOrden==='antiguos'?'Antiguos':'Recientes';
  renderHistorialMovimientos();
}
function fechaOrdenTx(t){return t.fechaOrden||localDateMs(String(t.fecha||'').split('T')[0])||0;}
function ordenarHistorial(txs){
  var dir=G.histOrden==='antiguos'?1:-1;
  return (txs||[]).slice().sort(function(a,b){
    var fa=fechaOrdenTx(a),fb=fechaOrdenTx(b);
    if(fa!==fb)return (fa-fb)*dir;
    var oa=parseInt(a.orden||a.id||0,10)||0,ob=parseInt(b.orden||b.id||0,10)||0;
    return (oa-ob)*dir;
  });
}
function actualizarFloatFechas(){
  var f=eid('date-filter-float');
  var page=eid('page-presupuesto');
  var btn=page?page.querySelector('.date-filter-btn'):null;
  var pc=page?page.querySelector('.pc'):null;
  if(!f||!page||!btn||!pc)return;
  if(!page.classList.contains('active')){
    f.classList.remove('show');
    return;
  }
  var br=btn.getBoundingClientRect();
  var pr=pc.getBoundingClientRect();
  var hidden=br.bottom<=pr.top+8;
  f.classList.toggle('show',hidden&&(G.movimientos||[]).length>4);
}

function filtrarHistorial(txs){
  var tipo=G.histFiltroTipo||'todos',cat=G.histFiltroCat||'todos';
  return (txs||[]).filter(function(t){
    if(tipo==='ingreso'&&t.tipo!=='ingreso') return false;
    if(tipo==='ahorro'&&t.tipo!=='ahorro') return false;
    if(tipo==='egreso'&&!esEgresoTipo(t.tipo)) return false;
    if(cat!=='todos'&&t.tipo!==cat) return false;
    var fo=fechaOrdenTx(t);
    if(G.histFechaIni&&fo<new Date(G.histFechaIni+'T00:00:00').getTime()) return false;
    if(G.histFechaFin&&fo>new Date(G.histFechaFin+'T23:59:59').getTime()) return false;
    return true;
  });
}

function abrirEditarTx(id){
  var tx=(G.movimientos||[]).filter(function(t){return String(t.id)===String(id);})[0];
  if(!tx)return;
  G.editTx=tx;
  eid('e-tipo').value=tx.tipo;
  prepEditSubcats(tx.subcategoria);
  eid('e-monto').value=tx.monto;
  eid('e-fecha').value=String(tx.fecha||'').split('T')[0];
  eid('e-notas').value=tx.notas||'';
  eid('mov-edit').classList.add('open');
}

function prepEditSubcats(selected){
  var tipo=eid('e-tipo').value;
  var opts=uniqCanon(catalogSubcats(tipo));
  eid('e-sub').innerHTML=opts.map(function(s){return'<option value="'+hEsc(s)+'">'+hEsc(s)+'</option>';}).join('');
  if(selected) eid('e-sub').value=canonTxt(selected);
}

function guardarEdicion(){
  if(!G.editTx)return;
  var monto=moneyVal(eid('e-monto').value);
  var sub=eid('e-sub').value,tipo=eid('e-tipo').value;
  if(!monto||monto<=0){showToast('Ingresa un monto válido','err');return;}
  if(!sub){showToast('Selecciona una subcategoría','err');return;}
  var btn=eid('btn-edit-sv');btn.disabled=true;btn.textContent='Guardando...';
  google.script.run
    .withSuccessHandler(function(res){
      btn.disabled=false;btn.textContent='Guardar';
      if(!res||!res.ok){showToast('Error: '+(res?res.error:'desconocido'),'err');return;}
      eid('mov-edit').classList.remove('open');
      if(res.state)aplicarPostChangeState(res.state);
      else refrescarTrasMovimiento(res.mesCaja||mesDesdeFechaISO(eid('e-fecha').value)||G.histMes);
      syncTrasCambio({delay:350,mesInicio:res.mesCaja||G.mesActual,mesHist:G.histMes||res.mesCaja||G.mesActual,historial:true});
      showToast('Movimiento actualizado','ok');
    })
    .withFailureHandler(function(e){btn.disabled=false;btn.textContent='Guardar';showToast('Error: '+e,'err');})
    .actualizarMovimiento({
      id:G.editTx.id,mes:(G.histMes||G.mesActual),tipo:tipo,categoria:tipo,subcategoria:sub,
      monto:String(monto),fecha:eid('e-fecha').value,notas:eid('e-notas').value,fast:true,
      returnState:true,homeMes:G.mesActual,histMes:G.histMes||G.mesActual
    });
}

function abrirEliminarTx(id){
  var tx=(G.movimientos||[]).filter(function(t){return String(t.id)===String(id);})[0];
  if(!tx)return;
  G.deleteTx=tx;
  eid('del-text').innerHTML='Vas a eliminar <strong>'+tx.subcategoria+'</strong> por <strong>'+fmt(tx.monto)+'</strong>. Esta acción no se puede deshacer.';
  eid('mov-del').classList.add('open');
}

function confirmarEliminar(){
  if(!G.deleteTx)return;
  var btn=eid('btn-del-sv');btn.disabled=true;btn.textContent='Eliminando...';
  google.script.run
    .withSuccessHandler(function(res){
      btn.disabled=false;btn.textContent='Eliminar';
      if(!res||!res.ok){showToast('Error: '+(res?res.error:'desconocido'),'err');return;}
      eid('mov-del').classList.remove('open');
      if(res.state)aplicarPostChangeState(res.state);
      else{
        G.movimientos=(G.movimientos||[]).filter(function(t){return String(t.id)!==String(G.deleteTx.id);});
        cacheSetMovimientos(G.histMes,G.movimientos);
        renderHistorialMovimientos();
        refrescarTrasMovimiento(res.mesCaja||G.histMes);
      }
      syncTrasCambio({delay:350,mesInicio:res.mesCaja||G.mesActual,mesHist:G.histMes||res.mesCaja||G.mesActual,
        historial:true,tarjetas:Number(res.linkedCardEvents||0)>0});
      showToast('Movimiento eliminado','ok');
    })
    .withFailureHandler(function(e){btn.disabled=false;btn.textContent='Eliminar';showToast('Error: '+e,'err');})
    .eliminarMovimiento({id:G.deleteTx.id,fast:true,returnState:true,homeMes:G.mesActual,histMes:G.histMes||G.mesActual});
}

function refrescarTrasMovimiento(mesCaja){
  syncTrasCambio({delay:180,mesInicio:G.mesActual,mesHist:G.histMes||mesCaja||G.mesActual,historial:true});
}

function abrirModalCat(nombre){
  var source=G.homeCatResumen&&G.homeCatResumen.length?G.homeCatResumen:getCategoriasDetalle(G.mesData);
  var cat=source&&source.filter(function(c){return c.t===nombre;})[0];
  if(!cat)return;
  G.catManage={categoria:nombre,modo:'agregar',items:(cat.d&&cat.d.items?cat.d.items:[])};
  var items=cat.d&&cat.d.items?cat.d.items:[];
  var tot=cat.d?(cat.d.total||cat.d.totalCalculado||0):0;
  var totP=items.reduce(function(a,x){return a+(x.presupuesto||x.préstamo||0);},0);
  var sobrante=totP-tot;
  var s2=cat.aho?(tot>=totP?'ok':(tot>=totP*0.85?'warn':'over')):st(totP,tot);

  eid('cat-modal-title').textContent=({'Necesidades':'🏠','Deseos':'🎮','Deudas':'💳','Ahorros':'🏦'}[nombre]||'')+' '+nombre;
  eid('cat-modal-badge').innerHTML='<span class="bdg '+(s2==='ok'?'ok':s2==='warn'?'warn':'over')+'">'+(s2==='ok'?'En objetivo':s2==='warn'?'Cerca':'Excedido')+'</span>';

  eid('cat-modal-res').innerHTML=[
    {l:'Presupuesto',v:totP,c:'var(--t2)'},
    {l:'Gastado',    v:tot, c:s2==='ok'?'var(--ok)':s2==='over'?'var(--over)':'var(--warn)'},
    {l:sobrante>=0?'Sobrante':'Excedido',v:Math.abs(sobrante),c:sobrante>=0?'var(--ok)':'var(--over)'}
  ].map(function(r){
    return'<div class="card p12 cr12"><div class="lup">'+r.l+'</div><div class="amd" style="color:'+r.c+'">'+fmt(r.v)+'</div></div>';
  }).join('');

  var tbl='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">'
    +'<thead><tr>'
    +'<th class="cat-modal-hdr" style="padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.06);text-align:left">Subcategoría</th>'
    +'<th class="cat-modal-hdr" style="padding:8px 4px;border-bottom:1px solid rgba(0,0,0,0.06);text-align:right">Presup.</th>'
    +'<th class="cat-modal-hdr" style="padding:8px 4px;border-bottom:1px solid rgba(0,0,0,0.06);text-align:right">Actual</th>'
    +'<th class="cat-modal-hdr" style="padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.06);text-align:right">Sobrante</th>'
    +'</tr></thead><tbody>';

  items.filter(function(i){return(i.presupuesto||i.préstamo||0)>0||i.actual>0;}).forEach(function(i){
    var pres=i.presupuesto||i.préstamo||0,act=i.actual||0,sob=pres-act;
    var is2=cat.aho?(act>=pres?'ok':(act>=pres*0.85?'warn':'over')):st(pres,act);
    var colA=is2==='ok'?'var(--ok)':is2==='over'?'var(--over)':'var(--warn)';
    tbl+='<tr>'
      +'<td style="padding:10px 0;border-bottom:0.5px solid rgba(0,0,0,0.05);font-weight:600;color:var(--t1)">'+i.nombre+'</td>'
      +'<td style="padding:10px 4px;border-bottom:0.5px solid rgba(0,0,0,0.05);text-align:right;font-family:-apple-system,BlinkMacSystemFont,Helvetica Neue,Arial,sans-serif;color:var(--t2)">'+fmt(pres)+'</td>'
      +'<td style="padding:10px 4px;border-bottom:0.5px solid rgba(0,0,0,0.05);text-align:right;font-family:-apple-system,BlinkMacSystemFont,Helvetica Neue,Arial,sans-serif;font-weight:700;color:'+colA+'">'+fmt(act)+'</td>'
      +'<td style="padding:10px 0;border-bottom:0.5px solid rgba(0,0,0,0.05);text-align:right;font-family:-apple-system,BlinkMacSystemFont,Helvetica Neue,Arial,sans-serif;color:'+(sob>=0?'var(--ok)':'var(--over)')+'">'+fmt(sob)+'</td></tr>';
  });
  tbl+='</tbody></table></div>';
  eid('cat-modal-tabla').innerHTML=tbl;
  eid('mov-cat').classList.add('open');
}

function catItemsActuales(){
  var nombre=G.catManage&&G.catManage.categoria;
  var source=G.homeCatResumen&&G.homeCatResumen.length?G.homeCatResumen:getCategoriasDetalle(G.mesData);
  var cat=source&&source.filter(function(c){return c.t===nombre;})[0];
  return cat&&cat.d&&cat.d.items?cat.d.items:[];
}

function catItemsGestionActivos(){
  var categoria=G.catManage&&G.catManage.categoria;
  var tipo=categoria==='Ahorros'?'ahorro':(categoria==='Deudas'?'deuda':'');
  var actuales=catItemsActuales();
  if(!tipo) return actuales;
  var activos=G.catalogo&&G.catalogo.subcats&&G.catalogo.subcats[tipo]?G.catalogo.subcats[tipo]:SUBCATS[tipo]||[];
  return activos.map(function(nombre){
    var item=actuales.filter(function(x){return nE(x.nombre)===nE(nombre);})[0]||{};
    return {
      nombre:nombre,
      presupuesto:item.presupuesto||item.préstamo||0,
      préstamo:item.préstamo||item.presupuesto||0,
      actual:item.actual||0
    };
  });
}

function abrirGestorCat(){
  if(!G.catManage||!G.catManage.categoria)return;
  G.catManage.modo=G.catManage.modo||'agregar';
  eid('cat-manage-title').textContent='Gestionar '+G.catManage.categoria;
  eid('cat-manage-sub').textContent=(G.mesActual||'Mes actual')+' - agrega, edita o elimina items del mes';
  eid('mov-cat-manage').classList.add('open');
  if(!G.catalogo){
    eid('cat-manage-note').textContent='Cargando opciones...';
    loadCatalogo().then(function(){G.catManage.items=catItemsGestionActivos();renderGestorCat();})
      .catch(function(){showToast('No pude cargar opciones','err');});
    return;
  }
  G.catManage.items=catItemsGestionActivos();
  renderGestorCat();
}

function setCatManageMode(modo){
  if(!G.catManage)return;
  G.catManage.modo=modo;
  renderGestorCat();
}

function renderGestorCat(){
  if(!G.catManage)return;
  var modo=G.catManage.modo||'agregar';
  ['add','edit','del'].forEach(function(k){
    var map={add:'agregar',edit:'editar',del:'eliminar'};
    var b=eid('cat-mode-'+k);if(b)b.classList.toggle('active',map[k]===modo);
  });
  var items=(G.catManage.items||[]).filter(function(x){return x&&x.nombre;});
  var sel=eid('cat-item-select');
  sel.innerHTML=items.map(function(x){return'<option value="'+String(x.nombre).replace(/"/g,'&quot;')+'">'+x.nombre+'</option>';}).join('');
  eid('cat-item-row').style.display=modo==='agregar'?'none':'block';
  eid('cat-name-row').style.display=modo==='eliminar'?'none':'block';
  eid('cat-budget-row').style.display=modo==='eliminar'?'none':'block';
  eid('cat-manage-save').textContent=modo==='eliminar'?'Eliminar':(modo==='editar'?'Guardar':'Agregar');
  eid('cat-manage-save').className='btn '+(modo==='eliminar'?'br':'bb')+' bful';
  eid('cat-budget-label').textContent=G.catManage.categoria==='Deudas'?'Préstamo':'Presupuesto';
  var esBal=G.catManage.categoria==='Ahorros'||G.catManage.categoria==='Deudas';
  eid('cat-status-row').style.display=esBal&&modo!=='eliminar'?'block':'none';
  eid('cat-balance-row').style.display=esBal&&modo==='agregar'?'block':'none';
  if(esBal){
    var bt=G.catManage.categoria==='Ahorros'?'Activo':'Pasivo';
    eid('cat-balance-label').textContent=bt==='Activo'?'Alojar en activo':'Alojar en pasivo';
    fillBalanceDestinoSelect('cat-balance-dest',bt,'',true);
    fillBalanceGrupoSelect('cat-balance-grupo',bt);
    catBalanceDestChange();
  }
  eid('cat-manage-note').textContent=modo==='eliminar'
    ?'Si tiene movimientos se marcará inactivo y dejará de aparecer en selectores.'
    :'El cambio aplica al mes seleccionado en Inicio.';
  if(modo==='agregar'){
    eid('cat-item-name').value='';
    eid('cat-item-budget').value='';
    if(esBal){eid('cat-item-estado').value='activo';eid('cat-balance-new').value='';}
  }else{
    catManageSelectItem();
  }
}

function catManageSelectItem(){
  if(!G.catManage)return;
  var name=eid('cat-item-select').value;
  var item=(G.catManage.items||[]).filter(function(x){return x.nombre===name;})[0]||{};
  eid('cat-item-name').value=item.nombre||'';
  eid('cat-item-budget').value=(item.presupuesto||item.préstamo||0)||'';
  var tipo=G.catManage.categoria==='Ahorros'?'ahorro':(G.catManage.categoria==='Deudas'?'deuda':'');
  if(tipo){
    var c=catalogFind(tipo,item.nombre||name)||{};
    eid('cat-item-estado').value=c.estado||'activo';
    fillBalanceDestinoSelect('cat-balance-dest',tipo==='ahorro'?'Activo':'Pasivo',c.balanceId||'',true);
    fillBalanceGrupoSelect('cat-balance-grupo',tipo==='ahorro'?'Activo':'Pasivo',c.grupo||'');
    eid('cat-balance-new').value='';
    catBalanceDestChange();
  }
}

function guardarGestorCat(){
  if(!G.catManage)return;
  var modo=G.catManage.modo||'agregar';
  var params={
    accion:modo,
    mes:G.mesActual||mesActualCalendario(),
    categoria:G.catManage.categoria,
    oldNombre:eid('cat-item-select').value||'',
    nombre:eid('cat-item-name').value.trim(),
    presupuesto:normMoney(eid('cat-item-budget').value)
  };
  if(params.categoria==='Ahorros'||params.categoria==='Deudas'){
    params.estado=eid('cat-item-estado').value;
    var tipoCat=params.categoria==='Ahorros'?'ahorro':'deuda';
    var actualCat=catalogFind(tipoCat,params.oldNombre)||catalogFind(tipoCat,params.nombre)||{};
    if(modo==='agregar'){
      params.balanceCodigo=eid('cat-balance-dest').value==='__new'?'':eid('cat-balance-dest').value;
      params.balanceNombreNuevo=eid('cat-balance-new').value.trim();
      params.balanceGrupo=eid('cat-balance-grupo').value;
      if(!params.balanceCodigo&&!params.balanceNombreNuevo){
        if(!(params.categoria==='Deudas'&&params.balanceGrupo==='Pasivos Fijos')){showToast('Asigna destino en balance','err');return;}
      }
    }else{
      params.balanceCodigo=actualCat.balanceId||'';
      params.balanceGrupo=actualCat.grupo||'';
      params.balanceNombreNuevo='';
    }
  }
  if(modo!=='eliminar'&&!params.nombre){showToast('Escribe el nombre del item','err');return;}
  if(modo!=='agregar'&&!params.oldNombre){showToast('Selecciona un item','err');return;}
  var btn=eid('cat-manage-save'),old=btn.textContent;
  btn.disabled=true;btn.textContent='Guardando...';
  gsRun('gestionarItemCategoria',[params])
    .then(function(res){
      btn.disabled=false;btn.textContent=old;
      if(!res||!res.ok){showToast((res&&res.error)||'Error al guardar','err');return;}
      if(res.mesData){
        G.mesData=res.mesData;
        cacheSetBootHome(params.mes,res.mesData);
        cacheSet('lastGoodHome',{mes:params.mes,data:res.mesData});
        renderHome(res.mesData);
      }
      eid('mov-cat-manage').classList.remove('open');
      loadCatalogo().then(function(){abrirModalCat(params.categoria);});
      showToast('Item actualizado','ok');
      syncTrasCambio({delay:120,mesInicio:params.mes,mesHist:G.histMes||params.mes,tarjetas:true,balance:true});
    })
    .catch(function(e){
      btn.disabled=false;btn.textContent=old;
      showToast('Error: '+e,'err');
    });
}

function loadTarjetas(){
  cargarTarjetasState({mes:G.tcMesActual||G.mesActual,idx:G.tcIdx||0,anio:G.tdcAnio||2026},6500)
    .then(function(res){if(!res||res.ok===false)showToast('Error tarjetas','err');});
}

function cortoALargo(m){
  var p=String(m||'').split(' ');
  if(p.length<2)return m||'';
  var abbr=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var idx=abbr.indexOf(p[0]);
  return (idx>=0?MESES_NOM_JS[idx]:p[0])+' '+p[1];
}
function mesSiguienteNombre(mes){
  var p=String(mes||'').split(' ');
  var idx=MESES_NOM_JS.indexOf(p[0]);
  var yy=parseInt(p[1],10);
  if(idx<0||isNaN(yy))return mes||'';
  idx++;
  if(idx>11){idx=0;yy++;}
  return MESES_NOM_JS[idx]+' '+String(yy).padStart(2,'0');
}
function mesDesdeFechaISO(iso){
  if(!iso)return G.mesActual||'';
  var p=String(iso).split('-');
  if(p.length<2)return G.mesActual||'';
  var idx=parseInt(p[1],10)-1,yy=String(p[0]||'').slice(-2);
  return (MESES_NOM_JS[idx]||MESES_NOM_JS[new Date().getMonth()])+' '+yy;
}
function llenarMesAplicadoTdc(valor){
  var sel=eid('tdc-mes-aplica');if(!sel)return;
  var meses=G.meses&&G.meses.length?G.meses.slice():[];
  var deseado=valor||mesSiguienteNombre(mesDesdeFechaISO(eid('tdc-fecha').value)||G.tcMesActual||G.mesActual);
  if(meses.indexOf(deseado)<0)meses.push(deseado);
  sel.innerHTML=meses.map(function(m){return'<option value="'+m+'">'+m+'</option>';}).join('');
  sel.value=deseado;
}
function actualizarMesAplicadoDefault(){
  if(G.tdcAccion==='abono'){
    var base=G.tcMesActual||mesDesdeFechaISO(eid('tdc-fecha').value)||G.mesActual;
    llenarMesAplicadoTdc(mesSiguienteNombre(base));
    actualizarHintCargoAbono();
  }
}

function prepararMesesTarjeta(){
  var selMes=eid('sel-tc-mes');
  if(!selMes)return;
  var t=G.tarjetas&&G.tarjetas[G.tcIdx];
  var mesesTarjeta=t?(G.tdcAnio===2026?t.meses2026:t.meses2025):null;
  var base=(mesesTarjeta&&mesesTarjeta.length)?mesesTarjeta.map(cortoALargo):((G.meses&&G.meses.length)?G.meses.slice():[]);
  var preferido=G.tcMesActual||G.mesActual||base[base.length-1]||'';
  if(base.indexOf(preferido)<0&&base.length)preferido=base[base.length-1];
  selMes.innerHTML=base.map(function(m){return'<option value="'+m+'">'+m+'</option>';}).join('');
  selMes.value=preferido;
  G.tcMesActual=preferido;
  var selAnio=eid('sel-tc-anio');if(selAnio)selAnio.value=String(G.tdcAnio||2026);
}

function renderSelectorTarjeta(){
  var selected=G.tarjetas&&G.tarjetas[G.tcIdx];
  var issuer=eid('tc-issuer');if(issuer)issuer.textContent=selected&&selected.emisor?selected.emisor:'Tarjetas de crédito';
  eid('tc-sel').className='tdc-wallet '+(selected?'stacked':'');
  eid('tc-sel').innerHTML='<div class="tdc-wallet-grid">'
    +(G.tarjetas||[]).map(function(t,i){
    var activo=i===G.tcIdx;
    var res=getResumenTdc(t);
    var alDia=res.alDia||res.pendiente<=0.009;
    var estado=res.saldoFavor>0?'Saldo a favor':(alDia?'Al dia':'Por recoger');
    var monto=res.saldoFavor>0?fmt(res.saldoFavor):(alDia?'OK':fmt(res.pendiente));
    if(res.saldoFavor>0){estado='Saldo a favor';monto=fmt(res.saldoFavor);}
    var wrapClass=selected?(activo?'tdc-wallet-card-wrap active':'tdc-wallet-card-wrap back'):'tdc-wallet-card-wrap';
    var brand=String(t.red||t.logo||'other').toLowerCase();if(brand==='mc')brand='mastercard';
    var logo=CARD_LOGOS[brand]?'<img class="card-brand-logo '+(brand==='mastercard'?'mc':'visa')+'" src="'+CARD_LOGOS[brand]+'" alt="'+brand+'">':'';
    if(!logo)logo='<span class="card-network-text">'+hEsc(brand==='other'?'Tarjeta':brand)+'</span>';
    return'<div class="'+wrapClass+'" onclick="selectTarjeta('+i+')">'
      +'<div class="bcard '+t.clase+'" style="cursor:pointer">'
      +logo
      +'<div class="bc-num">'+t.numero+'</div>'
      +'<div class="bc-bal">'+t.nombre+'</div>'
      +'<div class="tdc-card-status"><div class="tdc-card-state">'+estado+'</div><div class="tdc-card-amount '+(alDia?'ok':'')+'">'+monto+'</div></div>'
      +'<div class="tdc-card-tap">'+(activo?'Toca para resumen':'Cambiar')+'</div>'
      +'</div></div>';
  }).join('')+'</div>';
}

function selectTarjeta(i){
  if(G.tcIdx===i&&G.tarjetas&&G.tarjetas[G.tcIdx]){abrirModalTDC();return;}
  G.tcIdx=i;prepararMesesTarjeta();renderSelectorTarjeta();renderHistorialTarjeta();
}

function setTdcAnio(yr,el){
  G.tdcAnio=yr;
  qsa('.tdc-tab').forEach(function(x){x.classList.remove('active');});
  if(el)el.classList.add('active');
  var sel=eid('sel-tc-anio');if(sel)sel.value=String(yr);
  prepararMesesTarjeta();
  renderHistorialTarjeta();
}
function setTdcAnioValue(yr){
  G.tdcAnio=parseInt(yr,10)||2026;
  prepararMesesTarjeta();
  renderHistorialTarjeta();
}


function conceptoTdcEs(valor,esperado){
  var clean=function(v){
    return String(v||'').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'')
      .trim();
  };
  var v=clean(valor),e=clean(esperado);
  if(e.indexOf('pagos')===0&&e.indexOf('cr')>-1) return v.indexOf('pagos')===0&&v.indexOf('cr')>-1;
  return v===e;
}

function getResumenTdc(t){
  var mes=G.tcMesActual||G.mesActual||G.meses[G.meses.length-1];
  var hist=G.tdcAnio===2026?t.historial2026:t.historial2025;
  var meses=G.tdcAnio===2026?t.meses2026:t.meses2025;
  var mesCorto=mes?mes.split(' ')[0].slice(0,3)+' '+mes.split(' ')[1]:'';
  var idx=meses?meses.indexOf(mesCorto):-1;
  var out={mes:mes,idx:idx,meses:meses,hist:hist,consumos:0,pagos:0,pagosMes:0,saldoRot:0,saldoReal:0,saldoDiferido:0,saldoRotAnt:0,pendiente:0,saldoFavor:0,alDia:false};
  if(!hist||idx<0)return out;
  var idxPago=idx+1<meses.length?idx+1:idx;
  var pagosSiguiente=0;
  hist.forEach(function(f){
    var v=f[meses[idx]]||0;
    var vp=f[meses[idxPago]]||0;
    if(conceptoTdcEs(f.concepto,'Consumos')) out.consumos=v;
    if(conceptoTdcEs(f.concepto,'Pagos / Créditos')){out.pagosMes=v;pagosSiguiente=vp;}
    if(conceptoTdcEs(f.concepto,'Total/ Saldo Rotativo')) out.saldoRot=v;
    if(conceptoTdcEs(f.concepto,'Saldo Diferido')) out.saldoDiferido=v;
    if(conceptoTdcEs(f.concepto,'Saldo Real')) out.saldoReal=v;
    if(idx>0&&conceptoTdcEs(f.concepto,'Total/ Saldo Rotativo')) out.saldoRotAnt=f[meses[idx-1]]||0;
  });
  out.pagos=pagosSiguiente;
  var delta=Math.round((out.consumos-out.pagos+Number.EPSILON)*100)/100;
  out.pendiente=delta>0?delta:0;
  out.saldoFavor=delta<0?Math.abs(delta):0;
  out.alDia=Math.abs(delta)<=0.009;
  return out;
}

function mesAnteriorLabel(mes){
  if(!mes)return'';
  var p=mes.split(' '),idx=MESES_NOM_JS.indexOf(p[0]),yr=parseInt(p[1],10);
  if(idx<0||isNaN(yr))return'';
  idx--;if(idx<0){idx=11;yr--;}
  return MESES_NOM_JS[idx]+' '+String(yr).padStart(2,'0');
}

function renderHistorialTarjeta(){
  var t=G.tarjetas&&G.tarjetas[G.tcIdx];if(!t)return;
  renderSelectorTarjeta();
  eid('tc-title').textContent=t.nombre;
  var resTdc=getResumenTdc(t),saldoRotTC=resTdc.saldoRot;

  var estadoTdc=resTdc.saldoFavor>0?'Saldo a favor':(resTdc.alDia||resTdc.pendiente<=0.009?'Al dia':'Saldo por recoger');
  var valorEstadoTdc=resTdc.saldoFavor>0?resTdc.saldoFavor:(resTdc.alDia?0:resTdc.pendiente);
  eid('tc-resumen').innerHTML=[
    {l:'Consumos del mes',v:resTdc.consumos,c:'var(--over)'},
    {l:'Valor recogido',v:resTdc.pagos,c:'var(--ok)'},
    {l:estadoTdc,v:valorEstadoTdc,c:resTdc.saldoFavor>0?'var(--blue)':((resTdc.alDia||resTdc.pendiente<=0.009)?'var(--ok)':'var(--warn)')}
  ].map(function(c){
    return'<div class="card p12 cr12"><div class="lup">'+c.l+'</div><div class="amd" style="color:'+c.c+'">'+(c.l.indexOf('Al')===0?'OK':fmt(c.v))+'</div></div>';
  }).join('');

  eid('tc-card').innerHTML='';

  var hist=G.tdcAnio===2026?t.historial2026:t.historial2025;
  var meses=G.tdcAnio===2026?t.meses2026:t.meses2025;
  if(!hist||!hist.length){eid('tc-hist').innerHTML='<div style="padding:16px;color:var(--t3);font-size:13px;text-align:center">Sin historial para este período</div>';return;}

  var html='<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:600px;background:#fff">'
    +'<thead><tr>'
    +'<th style="text-align:left;padding:9px 14px;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--t3);border-bottom:2px solid rgba(0,0,0,0.07);white-space:nowrap;min-width:160px;position:sticky;left:0;background:rgba(255,255,255,0.92);z-index:1">Concepto</th>'
    +meses.map(function(m){return'<th style="text-align:right;padding:9px 8px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--t3);border-bottom:2px solid rgba(0,0,0,0.07);white-space:nowrap;min-width:62px">'+m+'</th>';}).join('')
    +'</tr></thead><tbody>';

  hist.forEach(function(fila){
    var esSR=fila.concepto==='Saldo Real',esSRot=fila.concepto==='Total/ Saldo Rotativo';
    var esC=conceptoTdcEs(fila.concepto,'Consumos'),esP=conceptoTdcEs(fila.concepto,'Pagos / Créditos');
    html+='<tr style="'+(esSR?'background:rgba(0,122,255,0.03)':esSRot?'background:rgba(255,59,48,0.03)':'')+'">'
      +'<td style="padding:9px 14px;font-weight:'+(esSR||esSRot?'700':'500')+';color:'+(esSR?'var(--blue)':esSRot?'var(--over)':'var(--t1)')+';white-space:nowrap;border-bottom:0.5px solid rgba(0,0,0,0.04);position:sticky;left:0;background:'+(esSR?'rgba(230,242,255,0.95)':esSRot?'rgba(255,235,232,0.95)':'rgba(255,255,255,0.92)')+';z-index:1">'+fila.concepto+'</td>';
    meses.forEach(function(m){
      var v=fila[m]||0;
      var col=esSR?'var(--blue)':esSRot?(v>0?'var(--over)':'var(--t3)'):esP?(v>0?'var(--ok)':'var(--t3)'):esC?(v>0?'var(--over)':'var(--t3)'):(v>0?'var(--t1)':'var(--t3)');
      html+='<td style="text-align:right;padding:9px 8px;font-family:-apple-system,BlinkMacSystemFont,Helvetica Neue,Arial,sans-serif;font-size:12px;font-weight:'+(esSR||esSRot?'700':'400')+';color:'+col+';border-bottom:0.5px solid rgba(0,0,0,0.04);white-space:nowrap">'+(v!==0?fmt(v):'-')+'</td>';
    });
    html+='</tr>';
  });
  html+='</tbody></table>';
  eid('tc-hist').innerHTML='<div class="tc-hist-desktop" style="overflow-x:auto;-webkit-overflow-scrolling:touch;background:#fff;border-radius:20px">'+html+'</div>';
  if(G._tdcMovsReadyKey===t.id+'|'+G.tcMesActual){renderMovsTdc();return;}
  loadMovsTdc();
}

function _mesLargoACortoJS(mes){
  var p=String(mes||'').split(' ');
  return p.length>=2?p[0].slice(0,3)+' '+p[1]:'';
}

function loadMovsTdc(){
  var t=G.tarjetas&&G.tarjetas[G.tcIdx];if(!t||!G.tcMesActual)return;
  var mesPago=mesSiguienteNombre(G.tcMesActual);
  google.script.run
    .withSuccessHandler(function(res){
      G.tdcMovs=res&&res.ok?res.data||[]:[];
      google.script.run
        .withSuccessHandler(function(res2){G.tdcMovsAplicados=res2&&res2.ok?res2.data||[]:[];G._tdcMovsReadyKey=t.id+'|'+G.tcMesActual;renderMovsTdc();})
        .getMovimientosTarjeta(mesPago,t.id);
    })
    .getMovimientosTarjeta(G.tcMesActual,t.id);
}

function renderMovsTdc(){
  var box=eid('tc-app-movs');if(!box)return;
  var t=G.tarjetas&&G.tarjetas[G.tcIdx];
  var resTdc=t?getResumenTdc(t):{consumos:0,pagos:0,pendiente:0};
  var movs=G.tdcMovs||[],cargos=movs.filter(function(m){return m.tipo==='cargo';});
  var abonos=(G.tdcMovsAplicados&&G.tdcMovsAplicados.length?G.tdcMovsAplicados:movs).filter(function(m){return m.tipo==='abono';});
  var abonosPorCargo={};
  abonos.forEach(function(a){
    var cid=String(a.cargoId||'');
    if(cid) abonosPorCargo[cid]=(abonosPorCargo[cid]||0)+(parseFloat(a.monto)||0);
  });
  var rows=[];
  if(cargos.length){
    rows=cargos.map(function(m,idx){
      var valor=parseFloat(m.monto)||0;
      var dirigido=Math.min(valor,abonosPorCargo[String(m.id)]||0);
      var recogido=dirigido;
      var pendiente=Math.max(valor-recogido,0);
      return{idx:idx,m:m,valor:valor,recogido:recogido,pendiente:pendiente,aggregate:false};
    });
  }
  if(!rows.length){box.innerHTML='<div class="empty-state">Sin cargos detallados registrados para este mes. Agrega cada cargo con "+ Cargo" para verlos aquí uno por uno.</div>';G.tdcCargoRows=[];return;}
  G.tdcCargoRows=rows;
  var sumCargo=rows.reduce(function(a,r){return a+r.valor;},0);
  var sumRec=rows.reduce(function(a,r){return a+r.recogido;},0);
  var sumPend=rows.reduce(function(a,r){return a+r.pendiente;},0);
  box.innerHTML='<div class="tdc-month-table"><table><thead><tr><th>Cargos</th><th>Valor</th><th>Saldo<br>recogido</th><th>Saldo<br>pendiente</th></tr></thead><tbody>'
    +rows.map(function(r){
      return'<tr data-cargo-idx="'+r.idx+'" onclick="abrirDetalleCargoTdc('+r.idx+')">'
        +'<td><div class="tdc-charge-name">'+(r.m.notas||'Cargo')+'</div></td>'
        +'<td class="tov2">'+fmt(r.valor)+'</td>'
        +'<td class="tok2">'+fmt(r.recogido)+'</td>'
        +'<td style="color:'+(r.pendiente>0?'var(--warn)':'var(--t2)')+'">'+fmt(r.pendiente)+'</td></tr>';
    }).join('')
    +'<tr class="total"><td>Total</td><td class="tov2">'+fmt(sumCargo)+'</td><td class="tok2">'+fmt(sumRec)+'</td><td style="color:'+(sumPend>0?'var(--warn)':'var(--t2)')+'">'+fmt(sumPend)+'</td></tr>'
    +'</tbody></table></div>';
}

function abrirDetalleCargoTdc(idx){
  var r=G.tdcCargoRows&&G.tdcCargoRows[idx];if(!r)return;
  var t=G.tarjetas&&G.tarjetas[G.tcIdx];
  eid('tdc-cargo-title').textContent=r.m.notas||'Cargo';
  eid('tdc-cargo-body').innerHTML=
    '<div class="detail-line"><span>Tarjeta</span><strong>'+(t?t.nombre:'-')+'</strong></div>'
    +'<div class="detail-line"><span>Mes</span><strong>'+(G.tcMesActual||G.mesActual||'-')+'</strong></div>'
    +'<div class="detail-line"><span>Valor</span><strong class="tov2">'+fmt(r.valor)+'</strong></div>'
    +'<div class="detail-line"><span>Saldo recogido</span><strong class="tok2">'+fmt(r.recogido)+'</strong></div>'
    +'<div class="detail-line"><span>Saldo pendiente</span><strong style="color:'+(r.pendiente>0?'var(--warn)':'var(--t2)')+'">'+fmt(r.pendiente)+'</strong></div>'
    +(r.aggregate?'<div style="margin-top:10px;color:var(--t2);font-size:12px;line-height:1.35">Este resumen viene del historial mensual de la tarjeta en el libro. Para editarlo, registra cargos o abonos desde esta página.</div>':'');
  eid('tdc-cargo-edit').style.display=r.aggregate?'none':'';
  eid('tdc-cargo-pay').style.display=r.aggregate?'none':'';
  eid('tdc-cargo-delete').style.display=r.aggregate?'none':'';
  eid('tdc-cargo-edit').onclick=function(){if(r.aggregate)return;eid('mov-tdc-cargo-detail').classList.remove('open');editarMovTdc(r.m.id);};
  eid('tdc-cargo-pay').onclick=function(){if(r.aggregate)return;eid('mov-tdc-cargo-detail').classList.remove('open');abrirMovTdc('abono',r.m.id);};
  eid('tdc-cargo-delete').onclick=function(){if(r.aggregate)return;eid('mov-tdc-cargo-detail').classList.remove('open');eliminarMovTdc(r.m.id);};
  eid('mov-tdc-cargo-detail').classList.add('open');
}

function toggleMovsTdc(){G.tdcExpanded=!G.tdcExpanded;renderMovsTdc();}

function getCargoRowsAbonables(){
  return (G.tdcCargoRows||[]).filter(function(r){return !r.aggregate&&r.m&&r.m.id;});
}

function prepararSelectorCargoAbono(cargoId){
  var rows=getCargoRowsAbonables();
  var box=eid('tdc-cargo-target-box'),sel=eid('tdc-cargo-target');
  if(!box||!sel)return rows;
  box.classList.add('open');
  if(!rows.length){
    box.classList.remove('open');
    sel.innerHTML='';
    actualizarHintCargoAbono();
    return rows;
  }
  sel.innerHTML='<option value="">Abono general</option>'+rows.map(function(r){
    var label=(r.m.notas||'Cargo')+' · pendiente '+fmt(r.pendiente);
    return'<option value="'+r.m.id+'">'+label+'</option>';
  }).join('');
  var pre=cargoId||G.tdcAbonoCargoId;
  sel.value=pre?String(pre):'';
  actualizarHintCargoAbono();
  return rows;
}

function actualizarHintCargoAbono(){
  var sel=eid('tdc-cargo-target'),hint=eid('tdc-cargo-target-hint');
  if(!sel||!hint)return;
  var mesPago=eid('tdc-mes-aplica')?eid('tdc-mes-aplica').value:'';
  var fecha=eid('tdc-fecha')?eid('tdc-fecha').value:'';
  var mesCaja=mesDesdeFechaISO(fecha);
  var base='Sale de caja en '+(mesCaja||'-')+' y se registra en Pagos / Créditos de '+(mesPago||'-')+'. ';
  var row=getCargoRowsAbonables().filter(function(r){return String(r.m.id)===String(sel.value);})[0];
  if(!row){hint.textContent=base+'Sin cargo asociado: abono general de la tarjeta.';return;}
  hint.innerHTML=base+'Valor '+fmt(row.valor)+' · recogido '+fmt(row.recogido)+' · pendiente <strong style="color:'+(row.pendiente>0?'var(--warn)':'var(--ok)')+'">'+fmt(row.pendiente)+'</strong>';
}

function abrirMovTdc(tipo,cargoId){
  var t=G.tarjetas&&G.tarjetas[G.tcIdx];if(!t)return;
  G.tdcAccion=tipo;
  G.tdcEditId=null;
  G.tdcAbonoCargoId=cargoId||null;
  eid('tdc-mov-title').textContent=tipo==='cargo'?'Agregar cargo a '+t.nombre:'Agregar abono a '+t.nombre;
  eid('tdc-tarjeta-lbl').value=t.nombre+' · '+(G.tcMesActual||G.mesActual||'');
  eid('tdc-monto').value='';
  eid('tdc-fecha').value=todayISO();
  eid('tdc-notas').value='';
  eid('tdc-abono-extra').style.display=tipo==='abono'?'block':'none';
  eid('tdc-mes-aplica-box').style.display=tipo==='abono'?'block':'none';
  eid('tdc-cargo-target-box').classList.remove('open');
  eid('tdc-cargo-date-row').classList.remove('has-target');
  eid('tdc-cargo-target-hint').textContent='';
  if(tipo==='abono'){
    llenarMesAplicadoTdc(mesSiguienteNombre(G.tcMesActual||mesDesdeFechaISO(eid('tdc-fecha').value)||G.mesActual));
    var rows=prepararSelectorCargoAbono(cargoId);
    if(rows.length) eid('tdc-cargo-date-row').classList.add('has-target');
    var row=rows.filter(function(r){return String(r.m.id)===String(eid('tdc-cargo-target').value);})[0];
    if(row&&row.pendiente>0) eid('tdc-monto').value=row.pendiente.toFixed(2);
    eid('tdc-origen').value='egreso';eid('tdc-eg-tipo').value='deuda';prepTdcSubcats();toggleTdcOrigen();
  }
  eid('mov-tdc').classList.add('open');
  setTimeout(function(){eid('tdc-monto').focus();},250);
}

function editarMovTdc(id){
  var m=(G.tdcMovs||[]).filter(function(x){return String(x.id)===String(id);})[0];if(!m)return;
  var t=G.tarjetas&&G.tarjetas[G.tcIdx];if(!t)return;
  G.tdcEditId=id;G.tdcAccion=m.tipo;
  eid('tdc-mov-title').textContent=m.tipo==='cargo'?'Editar cargo de '+t.nombre:'Editar abono de '+t.nombre;
  eid('tdc-tarjeta-lbl').value=t.nombre+' · '+(G.tcMesActual||G.mesActual||'');
  eid('tdc-monto').value=m.monto;
  eid('tdc-fecha').value=String(m.fecha||'').split('T')[0];
  eid('tdc-notas').value=m.notas||'';
  eid('tdc-abono-extra').style.display=m.tipo==='abono'?'block':'none';
  eid('tdc-mes-aplica-box').style.display=m.tipo==='abono'?'block':'none';
  eid('tdc-cargo-target-box').classList.remove('open');
  eid('tdc-cargo-date-row').classList.remove('has-target');
  eid('tdc-cargo-target-hint').textContent='';
  if(m.tipo==='abono'){
    llenarMesAplicadoTdc(m.mes||G.tcMesActual||G.mesActual);
    G.tdcAbonoCargoId=m.cargoId||null;
    var rows=prepararSelectorCargoAbono(m.cargoId);
    if(rows.length) eid('tdc-cargo-date-row').classList.add('has-target');
    eid('tdc-origen').value=m.origen||'externo';
    eid('tdc-eg-tipo').value=m.categoria||'deuda';
    prepTdcSubcats();
    if(m.subcategoria) eid('tdc-sub').value=m.subcategoria;
    toggleTdcOrigen();
  }
  eid('mov-tdc').classList.add('open');
}

function toggleTdcOrigen(){
  eid('tdc-egreso-box').style.display=eid('tdc-origen').value==='egreso'?'block':'none';
}

function prepTdcSubcats(){
  var tipo=eid('tdc-eg-tipo').value;
  var opts=uniqCanon(catalogSubcats(tipo));
  eid('tdc-sub').innerHTML=opts.map(function(s){return'<option value="'+hEsc(s)+'">'+hEsc(s)+'</option>';}).join('');
  if(tipo==='deuda'&&opts.indexOf('Diferido Artefacta')>=0) eid('tdc-sub').value='Diferido Artefacta';
}

function guardarMovTdc(){
  var t=G.tarjetas&&G.tarjetas[G.tcIdx];if(!t)return;
  var monto=moneyVal(eid('tdc-monto').value);
  if(!monto||monto<=0){showToast('Ingresa un monto válido','err');return;}
  var btn=eid('btn-tdc-sv');btn.disabled=true;btn.textContent='Registrando...';
  var fechaTdc=eid('tdc-fecha').value;
  var mesCajaTdc=mesDesdeFechaISO(fechaTdc)||G.mesActual||G.tcMesActual;
  var mesGastoTdc=G.tcMesActual||G.mesActual||mesCajaTdc;
  var mesAplicadoTdc=G.tdcAccion==='abono'
    ? (eid('tdc-mes-aplica').value||mesSiguienteNombre(mesGastoTdc)||mesGastoTdc)
    : mesGastoTdc;
  if(G.tdcAccion==='abono'&&mesAplicadoTdc===mesCajaTdc){
    var okSame=confirm('Este abono saldrá de caja en '+mesCajaTdc+' y también se aplicará a Pagos / Créditos de '+mesAplicadoTdc+'. Si estás adelantando el pago del siguiente ciclo, cambia el campo "Aplicar a Pagos / Créditos". ¿Quieres registrarlo así?');
    if(!okSame){btn.disabled=false;btn.textContent='Registrar';return;}
  }
  var params={
    mes:mesAplicadoTdc,
    mesAplica:mesAplicadoTdc,
    mesPagoCredito:mesAplicadoTdc,
    mesGasto:mesGastoTdc,
    mesRegistro:(G.tdcAccion==='abono'?mesCajaTdc:(G.tcMesActual||G.mesActual)),
    tarjeta:t.id,
    tipo:G.tdcAccion,
    monto:String(monto),
    fecha:fechaTdc,
    notas:eid('tdc-notas').value,
    fast:true,
    returnState:true,
    homeMes:G.mesActual,
    histMes:G.histMes||mesGastoTdc,
    cardMes:G.tcMesActual||mesGastoTdc,
    cardIdx:G.tcIdx||0,
    cardYear:G.tdcAnio||2026
  };
  if(G.tdcAccion==='abono'){
    params.cargoId=eid('tdc-cargo-target').value||'';
    params.origen=eid('tdc-origen').value;
    if(params.origen==='egreso'){
      params.egresoTipo=eid('tdc-eg-tipo').value;
      params.subcategoria=eid('tdc-sub').value;
    }
  }
  var runner=google.script.run
    .withSuccessHandler(function(res){
      btn.disabled=false;btn.textContent='Registrar';
      if(!res||!res.ok){showToast('Error: '+(res?res.error:'desconocido'),'err');return;}
      eid('mov-tdc').classList.remove('open');
      showToast(G.tdcEditId?'Transacción actualizada':(G.tdcAccion==='cargo'?'Cargo agregado':'Abono agregado'),'ok');
      var mesCajaRes=res.mesCaja||mesCajaTdc;
      if(res.state)aplicarPostChangeState(res.state);
      else syncTrasCambio({delay:80,mesInicio:mesCajaRes,mesHist:G.histMes||mesCajaRes,tarjetas:true,historial:true});
      syncTrasCambio({delay:350,mesInicio:mesCajaRes,mesHist:G.histMes||mesCajaRes,tarjetas:true,historial:true});
    })
    .withFailureHandler(function(e){btn.disabled=false;btn.textContent='Registrar';showToast('Error: '+e,'err');});
  if(G.tdcEditId){params.id=G.tdcEditId;runner.actualizarMovimientoTarjeta(params);}
  else runner.registrarMovimientoTarjeta(params);
}

function eliminarMovTdc(id){
  var m=(G.tdcMovs||[]).filter(function(x){return String(x.id)===String(id);})[0];if(!m)return;
  G.tdcDeleteId=id;
  eid('tdc-del-text').innerHTML='Vas a eliminar <strong>'+(m.tipo==='abono'?'abono':'cargo')+'</strong> por <strong>'+fmt(m.monto)+'</strong>.';
  eid('mov-tdc-del').classList.add('open');
}

function confirmarEliminarTdc(){
  if(!G.tdcDeleteId)return;
  var btn=eid('btn-tdc-del');btn.disabled=true;btn.textContent='Eliminando...';
  google.script.run
    .withSuccessHandler(function(res){
      btn.disabled=false;btn.textContent='Eliminar';
      if(!res||!res.ok){showToast('Error: '+(res?res.error:'desconocido'),'err');return;}
      eid('mov-tdc-del').classList.remove('open');showToast('Transacción eliminada','ok');
      if(res.state)aplicarPostChangeState(res.state);
      else syncTrasCambio({delay:80,mesInicio:res.mesCaja||G.mesActual,mesHist:G.histMes||res.mesCaja||G.mesActual,tarjetas:true,historial:true});
      syncTrasCambio({delay:350,mesInicio:res.mesCaja||G.mesActual,mesHist:G.histMes||res.mesCaja||G.mesActual,tarjetas:true,historial:true});
    })
    .withFailureHandler(function(e){btn.disabled=false;btn.textContent='Eliminar';showToast('Error: '+e,'err');})
    .eliminarMovimientoTarjeta({id:G.tdcDeleteId,fast:true,returnState:true,homeMes:G.mesActual,histMes:G.histMes||G.mesActual,cardMes:G.tcMesActual||G.mesActual,cardIdx:G.tcIdx||0,cardYear:G.tdcAnio||2026});
}

function llenarMesesDiferido(id,valor){
  var el=eid(id);if(!el)return;
  var meses=(G.meses||[]).slice(),base=G.tcMesActual||G.mesActual;
  if(base&&meses.indexOf(base)<0)meses.push(base);
  var sig=mesSiguienteNombre(base);if(sig&&meses.indexOf(sig)<0)meses.push(sig);
  el.innerHTML=meses.map(function(m){return'<option value="'+hEsc(m)+'">'+hEsc(m)+'</option>';}).join('');
  el.value=valor&&meses.indexOf(valor)>=0?valor:(sig||base||meses[0]||'');
}

function toggleNuevoPasivoDiferido(){
  eid('tdc-dif-pasivo-new-box').style.display=eid('tdc-dif-pasivo').value==='__new'?'block':'none';
}

function estadoCargaDiferido(msg,tipo){
  var box=eid('tdc-dif-status');if(!box)return;
  if(!msg){box.style.display='none';box.textContent='';return;}
  box.style.display='block';box.textContent=msg;
  box.style.background=tipo==='err'?'rgba(255,59,48,.09)':'rgba(0,122,255,.08)';
  box.style.color=tipo==='err'?'var(--over)':'var(--blue)';
}

function abrirDiferidoTdc(modo){
  var t=G.tarjetas&&G.tarjetas[G.tcIdx];
  if(!t){showToast('Espera a que carguen las tarjetas','err');return;}
  modo=modo==='liquidar'?'liquidar':'agregar';
  G.tdcDifMode=modo;
  G._tdcDifLoadSeq=(G._tdcDifLoadSeq||0)+1;
  var loadSeq=G._tdcDifLoadSeq;
  var btn=eid('btn-tdc-dif-save');btn.disabled=true;btn.textContent='Cargando...';
  eid('tdc-dif-title').textContent=modo==='agregar'?'Agregar diferido a '+t.nombre:'Liquidar diferido de '+t.nombre;
  eid('tdc-dif-add').style.display=modo==='agregar'?'block':'none';
  eid('tdc-dif-pay').style.display=modo==='liquidar'?'block':'none';
  eid('tdc-liq-fecha').value=todayISO();
  llenarMesesDiferido('tdc-dif-inicio',G.tcMesActual||G.mesActual);
  llenarMesesDiferido('tdc-liq-mes',G.tcMesActual||G.mesActual);
  estadoCargaDiferido(modo==='agregar'?'Cargando opciones del balance...':'Cargando diferidos activos...');
  if(modo==='agregar'){
    eid('tdc-dif-nombre').value='';eid('tdc-dif-total').value='';eid('tdc-dif-cuota').value='';
    eid('tdc-dif-pasivo').disabled=true;
    eid('tdc-dif-pasivo').innerHTML='<option value="">Cargando...</option>';
    eid('tdc-dif-pasivo-new').value='';eid('tdc-dif-pasivo-new-box').style.display='none';
  }else{
    G.tdcDiferidos=[];
    eid('tdc-dif-select').disabled=true;
    eid('tdc-dif-select').innerHTML='<option value="">Cargando...</option>';
    eid('tdc-liq-origen').value='';
    eid('tdc-liq-activo-box').style.display='none';
    eid('tdc-liq-activo').disabled=true;
    eid('tdc-liq-activo').innerHTML='<option value="">Cargando...</option>';
    eid('tdc-liq-total').value='0.00';
    actualizarOrigenLiquidacion();
  }
  eid('mov-tdc-dif').classList.add('open');

  var catalogPromise=G.catalogo?Promise.resolve(G.catalogo):loadCatalogo();
  if(modo==='agregar'){
    catalogPromise.then(function(catalogo){
      if(loadSeq!==G._tdcDifLoadSeq)return;
      if(!catalogo)throw new Error('No se pudo cargar el balance');
      fillBalanceDestinoSelect('tdc-dif-pasivo','Pasivo','',true);
      eid('tdc-dif-pasivo').disabled=false;eid('tdc-dif-pasivo').value='__new';toggleNuevoPasivoDiferido();
      estadoCargaDiferido('');btn.disabled=false;btn.textContent='Guardar';
    }).catch(function(e){
      if(loadSeq!==G._tdcDifLoadSeq)return;
      estadoCargaDiferido('No se pudieron cargar los pasivos. Revisa la conexión e inténtalo otra vez.','err');
      btn.disabled=true;btn.textContent='Sin conexión';
    });
    return;
  }

  Promise.all([catalogPromise,gsRun('getDiferidosTdc',[t.id,G.tcMesActual||G.mesActual])]).then(function(all){
      if(loadSeq!==G._tdcDifLoadSeq)return;
      if(!all[0])throw new Error('No se pudo cargar el balance');
      var res=all[1];
      G.tdcDiferidos=res&&res.ok?res.data||[]:[];
      if(!G.tdcDiferidos.length){
        eid('tdc-dif-select').innerHTML='<option value="">Sin diferidos activos</option>';
        estadoCargaDiferido('Esta tarjeta no tiene diferidos activos para liquidar.');
        btn.disabled=true;btn.textContent='Sin diferidos';return;
      }
      eid('tdc-dif-select').innerHTML=G.tdcDiferidos.map(function(d){return'<option value="'+hEsc(d.id)+'">'+hEsc(d.nombre)+'</option>';}).join('');
      eid('tdc-dif-select').disabled=false;
      llenarActivosLiquidacion();
      eid('tdc-liq-activo').disabled=false;
      actualizarLiquidacionDiferido();actualizarOrigenLiquidacion();estadoCargaDiferido('');btn.disabled=false;btn.textContent='Guardar';
    }).catch(function(e){
      if(loadSeq!==G._tdcDifLoadSeq)return;
      estadoCargaDiferido('No se pudieron cargar los diferidos. Revisa la conexión e inténtalo otra vez.','err');
      btn.disabled=true;btn.textContent='Sin conexión';
    });
}

function saldoDiferidoEnMes(d,mes){
  if(!d)return 0;
  var destino=mesOrdenNombre(cortoALargo(mes)),base=mesOrdenNombre(cortoALargo(d.mesBase));
  var cobradas=moneyVal(d.cuotasAlMesBase)+(destino>=0&&base>=0?destino-base:0);
  if(!isFinite(cobradas)||cobradas<0)cobradas=0;
  return Math.round(Math.max(0,moneyVal(d.inicial)-moneyVal(d.cuota)*cobradas)*100)/100;
}

function llenarActivosLiquidacion(){
  var el=eid('tdc-liq-activo');if(!el)return;
  var opts=['<option value="">Selecciona el activo</option>'];
  balanceDestinos('Activo').forEach(function(x){
    var nombre=(x.grupo?x.grupo+' > ':'')+x.nombre;
    opts.push('<option value="'+hEsc(x.codigo)+'">'+hEsc(nombre+' · '+fmt(moneyVal(x.valor)))+'</option>');
  });
  el.innerHTML=opts.join('');
}

function actualizarOrigenLiquidacion(){
  var origen=eid('tdc-liq-origen')?eid('tdc-liq-origen').value:'';
  var box=eid('tdc-liq-activo-box'),activo=eid('tdc-liq-activo'),hint=eid('tdc-liq-origen-hint');
  if(box)box.style.display=origen==='activo'?'block':'none';
  if(activo)activo.disabled=origen!=='activo';
  if(!hint)return;
  if(origen==='saldo')hint.textContent='El total se registrará como pago de deuda y reducirá tu saldo disponible.';
  else if(origen==='activo')hint.textContent='El total se descontará del activo que selecciones.';
  else if(origen==='externo')hint.textContent='El total reducirá la deuda sin descontar tu saldo disponible ni tus activos.';
  else hint.textContent='Selecciona el origen que cubrirá el total calculado.';
}

function actualizarLiquidacionDiferido(){
  var id=eid('tdc-dif-select').value,d=(G.tdcDiferidos||[]).filter(function(x){return x.id===id;})[0];
  var total=d?saldoDiferidoEnMes(d,eid('tdc-liq-mes').value):0;
  eid('tdc-liq-total').value=total.toFixed(2);
}

function guardarDiferidoTdc(){
  var t=G.tarjetas&&G.tarjetas[G.tcIdx];if(!t)return;
  var btn=eid('btn-tdc-dif-save');btn.disabled=true;btn.textContent='Guardando...';
  var fn,params;
  if(G.tdcDifMode==='agregar'){
    var pasivo=eid('tdc-dif-pasivo').value,nombre=eid('tdc-dif-nombre').value.trim();
    params={tarjeta:t.id,nombre:nombre,inicial:String(moneyVal(eid('tdc-dif-total').value)),cuota:String(moneyVal(eid('tdc-dif-cuota').value)),mesInicio:eid('tdc-dif-inicio').value,balanceId:pasivo==='__new'?'':pasivo,balanceNombreNuevo:pasivo==='__new'?(eid('tdc-dif-pasivo-new').value.trim()||nombre):'',grupo:'Tarjeta de Crédito',homeMes:G.mesActual,histMes:G.histMes||G.mesActual,cardMes:G.tcMesActual||G.mesActual,cardIdx:G.tcIdx||0,cardYear:G.tdcAnio||2026};
    if(!nombre||!moneyVal(params.inicial)||!moneyVal(params.cuota)){btn.disabled=false;btn.textContent='Guardar';showToast('Completa nombre, saldo y cuota','err');return;}
    fn='registrarDiferidoTdc';
  }else{
    var total=moneyVal(eid('tdc-liq-total').value),origen=eid('tdc-liq-origen').value;
    var saldo=origen==='saldo'?total:0,activoMonto=origen==='activo'?total:0,externo=origen==='externo'?total:0;
    if(total<=0){btn.disabled=false;btn.textContent='Guardar';showToast('El diferido no tiene saldo en el mes seleccionado','err');return;}
    if(!origen){btn.disabled=false;btn.textContent='Guardar';showToast('Selecciona de dónde sale el dinero','err');return;}
    if(activoMonto>0&&!eid('tdc-liq-activo').value){btn.disabled=false;btn.textContent='Guardar';showToast('Selecciona el activo de origen','err');return;}
    var mesLiquidacion=eid('tdc-liq-mes').value;
    if(!confirm('Se liquidará el diferido por '+fmt(total)+' en '+mesLiquidacion+'. ¿Continuar?')){btn.disabled=false;btn.textContent='Guardar';return;}
    params={tarjeta:t.id,diferidoId:eid('tdc-dif-select').value,total:String(total),montoSaldo:String(saldo),montoActivo:String(activoMonto),montoExterno:String(externo),activoId:activoMonto>0?eid('tdc-liq-activo').value:'',mesPago:mesLiquidacion,mesGasto:mesLiquidacion,fecha:eid('tdc-liq-fecha').value,homeMes:G.mesActual,histMes:G.histMes||G.mesActual,cardMes:G.tcMesActual||G.mesActual,cardIdx:G.tcIdx||0,cardYear:G.tdcAnio||2026};
    fn='liquidarDiferidoTdc';
  }
  gsRun(fn,[params]).then(function(res){
    btn.disabled=false;btn.textContent='Guardar';
    if(!res||!res.ok){showToast('Error: '+(res?res.error:'desconocido'),'err');return;}
    eid('mov-tdc-dif').classList.remove('open');showToast(G.tdcDifMode==='agregar'?'Diferido agregado':'Diferido liquidado','ok');
    G.catalogo=null;loadCatalogo();
    if(res.state)aplicarPostChangeState(res.state);else syncTrasCambio({delay:80,mesInicio:G.mesActual,mesHist:G.histMes||G.mesActual,tarjetas:true,historial:true,balance:true});
  }).catch(function(e){btn.disabled=false;btn.textContent='Guardar';showToast('Error: '+e,'err');});
}

function abrirModalTDC(){
  var t=G.tarjetas&&G.tarjetas[G.tcIdx];if(!t)return;
  var mes=G.tcMesActual||G.mesActual||G.meses[G.meses.length-1];
  eid('tdc-hist-title').textContent=t.nombre;
  eid('tdc-hist-sub').textContent=mes+' · consumos y recogido';
  eid('tdc-hist-logo').innerHTML='<div style="width:44px;height:28px;border-radius:7px;'+(t.id==='MC'?'background:linear-gradient(135deg,#7a5c00,#daa520)':'background:linear-gradient(135deg,#c94b00,#f48c06)')+'"></div>';
  eid('tdc-hist-res').innerHTML='<div style="color:var(--t3);font-size:12px;text-align:center;padding:8px;grid-column:span 3">Cargando...</div>';
  eid('tdc-hist-cargos').innerHTML='';
  eid('mov-tdc-hist').classList.add('open');

  var hist=G.tdcAnio===2026?t.historial2026:t.historial2025;
  var meses=G.tdcAnio===2026?t.meses2026:t.meses2025;
  var mesCorto=mes.split(' ')[0].slice(0,3)+' '+mes.split(' ')[1];
  var mesIdx=meses.indexOf(mesCorto);

  if(!hist||!hist.length||mesIdx===-1){
    eid('tdc-hist-res').innerHTML='<div style="color:var(--t3);font-size:12px;text-align:center;padding:8px;grid-column:span 3">Sin datos para '+mes+'</div>';return;
  }

  var resumen=getResumenTdc(t);
  var debesPagar=resumen.consumos,pagos=resumen.pagos,pendiente=resumen.pendiente;

  eid('tdc-hist-res').innerHTML=[
    {l:'Debes pagar',v:debesPagar,c:'var(--over)'},
    {l:'Valor Recogido',v:pagos,c:'var(--ok)'},
    {l:'Por recoger',v:pendiente,c:pendiente>0?'var(--warn)':'var(--ok)'}
  ].map(function(c){
    return'<div class="card p12 cr12 tdc-hist-kpi"><div class="lup">'+c.l+'</div><div class="amd" style="color:'+c.c+'">'+fmt(c.v)+'</div></div>';
  }).join('');

  var cargosHtml='';
  hist.forEach(function(f){
    var v=f[meses[mesIdx]]||0;
    if(v===0&&f.concepto!=='Saldo Real') return;
    var esSR=f.concepto==='Saldo Real',esSRot=f.concepto==='Total/ Saldo Rotativo';
    var col=esSR?'var(--blue)':esSRot?(v>0?'var(--over)':'var(--ok)'):(v>0?'var(--t1)':'var(--t3)');
    cargosHtml+='<div class="tdc-cargo-row"><div style="flex:1;font-size:13px;font-weight:'+(esSR||esSRot?'700':'500')+';color:'+col+'">'+f.concepto+'</div>'
      +'<div style="font-family:-apple-system,BlinkMacSystemFont,Helvetica Neue,Arial,sans-serif;font-size:14px;font-weight:700;color:'+col+'">'+fmt(v)+'</div></div>';
  });
  var appRows=(G.tdcMovs||[]).map(function(m){
    var col=m.tipo==='abono'?'var(--ok)':'var(--over)';
    var origen=m.tipo==='abono'?(m.origen==='externo'?'externo':'egreso'):'cargo';
    return'<div class="tdc-cargo-row"><div style="flex:1"><div style="font-size:13px;font-weight:700;color:'+col+'">'+(m.tipo==='abono'?'Abono':'Cargo')+' app</div>'
      +'<div style="font-size:11px;color:var(--t3)">'+fmtFecha(m.fecha)+' · '+origen+(m.notas?' · '+m.notas:'')+'</div></div>'
      +'<div style="font-family:-apple-system,BlinkMacSystemFont,Helvetica Neue,Arial,sans-serif;font-size:14px;font-weight:700;color:'+col+'">'+(m.tipo==='abono'?'+':'-')+fmt(m.monto)+'</div></div>';
  }).join('');
  eid('tdc-hist-cargos').innerHTML=(cargosHtml||'<div style="padding:14px;color:var(--t3);font-size:13px;text-align:center">Sin movimientos base este mes</div>')
    +(appRows?'<div class="lup" style="padding:12px 14px 2px">Registrados en la app</div>'+appRows:'');
}

function configContext(){
  return{homeMes:G.mesActual||mesActualCalendario(),cardMes:G.tcMesActual||G.mesActual||mesActualCalendario(),cardIdx:G.tcIdx||0,cardYear:G.tdcAnio||2026};
}
function abrirConfiguracion(foco){
  eid('mov-config').classList.add('open');
  cerrarEditorTarjeta();cerrarEditorAsignacion();
  if(G.configuracion)renderConfiguracion(G.configuracion);
  else{
    eid('cfg-status').innerHTML='<span>Cargando configuración…</span>';
    eid('cfg-card-list').innerHTML='<div class="settings-empty">Consultando tarjetas…</div>';
    eid('cfg-allocation-list').innerHTML='<div class="settings-empty">Consultando activos…</div>';
  }
  gsRun('getConfiguracion',[]).then(function(res){
    if(!res||res.ok===false)throw new Error((res&&res.error)||'No se pudo cargar');
    G.configuracion=res;renderConfiguracion(res);
    if(foco){var section=eid('cfg-section-'+foco);if(section)setTimeout(function(){section.scrollIntoView({behavior:'smooth',block:'start'});},80);}
  }).catch(function(e){
    eid('cfg-status').innerHTML='<span class="tov2">No se pudo cargar la configuración</span>';
    showToast('Error: '+(e.message||e),'err');
  });
}
function renderConfiguracion(d){
  if(!d)return;
  eid('cfg-status').innerHTML='<span>Fuente principal: <b>'+hEsc(String(d.fuente||'supabase').toUpperCase())+'</b></span><span>'+hEsc(d.timezone||'America/Guayaquil')+'</span>';
  var cards=(d.tarjetas||[]).slice().sort(function(a,b){return(a.orden||0)-(b.orden||0);});
  eid('cfg-card-list').innerHTML=cards.length?cards.map(function(card){
    var inactive=!card.activo,network=String(card.red||'other').toUpperCase();
    return'<div class="settings-row" style="'+(inactive?'opacity:.58':'')+'"><div class="settings-row-icon '+hEsc(card.estilo||'generic-card')+'">'+hEsc(network.slice(0,4))+'</div>'
      +'<div class="settings-row-main"><b>'+hEsc(card.nombre||card.codigo)+'</b><span>'+hEsc(card.emisor||'Sin emisor')+' · •••• '+hEsc(card.ultimos4)+(inactive?' · Archivada':'')+'</span></div>'
      +'<div class="settings-row-actions">'
      +(inactive?'':'<button class="settings-icon-btn" onclick="moverTarjetaConfiguracionUI(\''+card.codigo+'\',-1)" title="Subir">↑</button><button class="settings-icon-btn" onclick="moverTarjetaConfiguracionUI(\''+card.codigo+'\',1)" title="Bajar">↓</button>')
      +'<button class="settings-icon-btn" onclick="abrirEditorTarjeta(\''+card.codigo+'\')" title="'+(inactive?'Editar y reactivar':'Editar')+'">'+(inactive?'↻':'✎')+'</button>'
      +(inactive?'':'<button class="settings-icon-btn danger" onclick="eliminarTarjetaConfiguracionUI(\''+card.codigo+'\')" title="Archivar">×</button>')
      +'</div></div>';
  }).join(''):'<div class="settings-empty">No hay tarjetas configuradas.</div>';

  var assigned=(d.activos||[]).filter(function(asset){return Number(asset.asignadoJapon||0)>0;});
  eid('cfg-goal-summary').innerHTML='<div class="settings-goal-kpi"><span>Asignado</span><b>'+fmt(d.totalAsignadoJapon||0)+'</b></div>'
    +'<div class="settings-goal-kpi"><span>Respaldado hoy</span><b class="'+((d.totalEfectivoJapon||0)<(d.totalAsignadoJapon||0)?'settings-warning':'')+'">'+fmt(d.totalEfectivoJapon||0)+'</b></div>';
  eid('cfg-allocation-list').innerHTML=assigned.length?assigned.map(function(asset){
    var short=Number(asset.efectivoJapon||0)+.004<Number(asset.asignadoJapon||0);
    return'<div class="settings-row"><div class="settings-row-main"><b>'+hEsc(asset.nombre)+'</b><span>'+hEsc(asset.grupo||'Activo')+' · Disponible '+fmt(asset.valor)+(short?' · respaldo insuficiente':'')+'</span></div>'
      +'<div class="settings-row-main" style="flex:0 0 auto;text-align:right"><b class="'+(short?'settings-warning':'tok2')+'">'+fmt(asset.asignadoJapon)+'</b><span>para Japón</span></div>'
      +'<div class="settings-row-actions"><button class="settings-icon-btn" onclick="abrirEditorAsignacion(\''+asset.codigo+'\')">✎</button><button class="settings-icon-btn danger" onclick="eliminarAsignacionMetaUI(\''+asset.codigo+'\')">×</button></div></div>';
  }).join(''):'<div class="settings-empty">Aún no has vinculado activos a Japón.</div>';
}
function abrirEditorTarjeta(codigo){
  var card=(G.configuracion&&G.configuracion.tarjetas||[]).filter(function(x){return x.codigo===codigo;})[0]||null;
  eid('cfg-card-editor').style.display='block';
  eid('cfg-card-editor-title').textContent=card?(card.activo?'Editar tarjeta':'Editar y reactivar tarjeta'):'Nueva tarjeta';
  eid('cfg-card-code').value=card?card.codigo:'';eid('cfg-card-code').disabled=!!card;
  eid('cfg-card-last4').value=card?card.ultimos4:'';
  eid('cfg-card-name').value=card?card.nombre:'';
  eid('cfg-card-issuer').value=card?card.emisor:'';
  eid('cfg-card-network').value=card?card.red:'visa';
  eid('cfg-card-style').value=card?card.estilo:'visa-card';
  eid('cfg-card-editor').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function cerrarEditorTarjeta(){var box=eid('cfg-card-editor');if(box)box.style.display='none';}
function guardarTarjetaConfiguracionUI(){
  var code=String(eid('cfg-card-code').value||'').trim().toUpperCase();
  var name=eid('cfg-card-name').value.trim(),last4=String(eid('cfg-card-last4').value||'').replace(/\D/g,'');
  if(!/^[A-Z0-9][A-Z0-9_-]{1,15}$/.test(code)){showToast('Código: 2 a 16 letras o números','err');return;}
  if(!name){showToast('Escribe el nombre de la tarjeta','err');return;}
  if(!/^\d{4}$/.test(last4)){showToast('Escribe los últimos 4 dígitos','err');return;}
  var params={codigo:code,nombre:name,emisor:eid('cfg-card-issuer').value.trim(),ultimos4:last4,
    red:eid('cfg-card-network').value,estilo:eid('cfg-card-style').value,activo:true};
  Object.assign(params,configContext());
  var btn=eid('cfg-card-save');btn.disabled=true;btn.textContent='Guardando…';
  gsRun('guardarTarjetaConfiguracion',[params]).then(function(res){
    btn.disabled=false;btn.textContent='Guardar tarjeta';
    if(!res||res.ok===false)throw new Error((res&&res.error)||'No se pudo guardar');
    aplicarRespuestaConfiguracion(res);cerrarEditorTarjeta();showToast('Tarjeta guardada','ok');
  }).catch(function(e){btn.disabled=false;btn.textContent='Guardar tarjeta';showToast('Error: '+(e.message||e),'err');});
}
function eliminarTarjetaConfiguracionUI(codigo){
  var card=(G.configuracion&&G.configuracion.tarjetas||[]).filter(function(x){return x.codigo===codigo;})[0]||{};
  if(!confirm('¿Archivar '+(card.nombre||codigo)+'? Su historial, cargos y diferidos se conservarán.'))return;
  var params={codigo:codigo};Object.assign(params,configContext());
  gsRun('eliminarTarjetaConfiguracion',[params]).then(function(res){
    if(!res||res.ok===false)throw new Error((res&&res.error)||'No se pudo archivar');
    aplicarRespuestaConfiguracion(res);showToast('Tarjeta archivada; historial conservado','ok');
  }).catch(function(e){showToast('Error: '+(e.message||e),'err');});
}
function moverTarjetaConfiguracionUI(codigo,direccion){
  var params={codigo:codigo,direccion:direccion};Object.assign(params,configContext());
  gsRun('ordenarTarjetaConfiguracion',[params]).then(function(res){
    if(!res||res.ok===false)throw new Error((res&&res.error)||'No se pudo ordenar');
    aplicarRespuestaConfiguracion(res);
  }).catch(function(e){showToast('Error: '+(e.message||e),'err');});
}
function abrirEditorAsignacion(codigo){
  var assets=(G.configuracion&&G.configuracion.activos||[]).filter(function(asset){return asset.activo||asset.codigo===codigo;});
  var select=eid('cfg-allocation-asset');
  select.innerHTML=assets.map(function(asset){return'<option value="'+hEsc(asset.codigo)+'">'+hEsc((asset.grupo?asset.grupo+' · ':'')+asset.nombre)+' — '+fmt(asset.valor)+'</option>';}).join('');
  if(codigo)select.value=codigo;
  var selected=assets.filter(function(asset){return asset.codigo===select.value;})[0];
  eid('cfg-allocation-amount').value=selected&&selected.asignadoJapon?String(selected.asignadoJapon):'';
  eid('cfg-allocation-editor').style.display='block';actualizarHintAsignacion();
  eid('cfg-allocation-editor').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function cerrarEditorAsignacion(){var box=eid('cfg-allocation-editor');if(box)box.style.display='none';}
function actualizarHintAsignacion(){
  var code=eid('cfg-allocation-asset').value;
  var asset=(G.configuracion&&G.configuracion.activos||[]).filter(function(x){return x.codigo===code;})[0];
  eid('cfg-allocation-hint').textContent=asset?'Disponible en '+asset.nombre+': '+fmt(asset.valor)+'. Esta asignación no mueve ni duplica dinero.':'';
}
function guardarAsignacionMetaUI(){
  var code=eid('cfg-allocation-asset').value,amount=moneyVal(eid('cfg-allocation-amount').value);
  var asset=(G.configuracion&&G.configuracion.activos||[]).filter(function(x){return x.codigo===code;})[0];
  if(!asset){showToast('Selecciona un activo','err');return;}
  if(amount<=0){showToast('Escribe un monto mayor a cero','err');return;}
  if(amount>Number(asset.valor||0)+.004){showToast('El monto supera el valor del activo','err');return;}
  guardarAsignacionMetaRequest(code,amount,false);
}
function eliminarAsignacionMetaUI(codigo){
  if(!confirm('¿Quitar este activo de la meta Japón? El saldo del activo no cambiará.'))return;
  guardarAsignacionMetaRequest(codigo,0,true);
}
function guardarAsignacionMetaRequest(codigo,monto,eliminando){
  var params={meta:'japan',balanceCodigo:codigo,monto:String(monto)};Object.assign(params,configContext());
  var btn=eid('cfg-allocation-save');if(btn){btn.disabled=true;btn.textContent='Guardando…';}
  gsRun('guardarAsignacionMeta',[params]).then(function(res){
    if(btn){btn.disabled=false;btn.textContent='Guardar asignación';}
    if(!res||res.ok===false)throw new Error((res&&res.error)||'No se pudo guardar');
    aplicarRespuestaConfiguracion(res);cerrarEditorAsignacion();showToast(eliminando?'Asignación eliminada':'Asignación guardada','ok');
  }).catch(function(e){if(btn){btn.disabled=false;btn.textContent='Guardar asignación';}showToast('Error: '+(e.message||e),'err');});
}
function aplicarRespuestaConfiguracion(res){
  if(res.configuracion){G.configuracion=res.configuracion;renderConfiguracion(res.configuracion);}
  else gsRun('getConfiguracion',[]).then(function(cfg){if(cfg&&cfg.ok){G.configuracion=cfg;renderConfiguracion(cfg);}});
  if(res.tarjetas)aplicarTarjetasState(res.tarjetas);
  if(res.japon){G.japon=res.japon;paintHomeJapon(res.japon);renderModalJapon(res.japon);}
}
function abrirConfigCategoria(nombre){
  eid('mov-config').classList.remove('open');
  abrirModalCat(nombre);setTimeout(function(){abrirGestorCat();},80);
}
function abrirConfigBalance(tipo){
  eid('mov-config').classList.remove('open');navTo('balance');
  if(G.balance){G.balEdit=true;renderBalance(G.balance);showToast('Modo edición del Balance','ok');}
  else showToast('Cargando Balance General…','ok');
}

function loadJapon(){
  google.script.run
    .withSuccessHandler(function(res){if(!res||!res.ok){showToast('Error Japón','err');return;}G.japon=res;renderJapon(res);})
    .withFailureHandler(function(e){showToast('Error: '+e,'err');})
    .getViajeJapon();
}
function renderJapon(d){
  renderModalJapon(d);
}
function renderModalJapon(d){
  var body=eid('j-modal-body');if(!body||!d)return;
  var w=Math.min(d.porcentaje||0,100),pct=(d.porcentaje||0).toFixed(1)+'%';
  var sbj=eid('sb-j');if(sbj)sbj.textContent='Japón: '+pct;
  var tram=(d.tramites||[]).map(function(t){
    return'<div class="tram-row"><div><div style="font-size:13px;font-weight:700">'+t.nombre+'</div>'
      +'<div style="font-size:11px;color:var(--t3)">'+fmt(t.presupuesto)+'</div></div>'
      +'<div class="fr g8">'+(G.japEdit?'<input class="edit-in" type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" value="'+t.actual+'" onchange="saveJap(\''+t.nombre+'\',normMoney(this.value))">':'')
      +'<span class="bdg '+(t.pagado?'ok':'warn')+'">'+(t.pagado?'Pagado':'Pendiente')+'</span></div></div>';
  }).join('');
  var items=(d.items||[]).map(function(i){
    var falt=i.faltante||(i.presupuesto-i.actual);
    return'<div class="jap-item"><div class="jn">'+i.nombre+'</div>'
      +'<div class="jv"><span style="color:var(--t3)">'+fmt(i.presupuesto)+'</span>'
      +(G.japEdit?'<input class="edit-in" type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" value="'+i.actual+'" onchange="saveJap(\''+i.nombre+'\',normMoney(this.value))">':'<span style="color:var(--ok)">'+fmt(i.actual)+'</span>')
      +(falt>0?'<span class="bdg over">-'+fmt(falt)+'</span>':'<span class="bdg ok">✓</span>')
      +'</div></div>';
  }).join('');
  var allocations=(d.asignaciones||[]).map(function(a){
    var short=Number(a.efectivo||0)+.004<Number(a.asignado||0);
    return'<div class="japan-allocation-row"><div><b>'+hEsc(a.nombre||a.balanceId)+'</b><span>'+hEsc(a.grupo||'Activo')+' · Disponible '+fmt(a.disponible)+(short?' · respaldo insuficiente':'')+'</span></div>'
      +'<strong class="'+(short?'settings-warning':'')+'">'+fmt(a.efectivo||0)+'</strong></div>';
  }).join('');
  var manual=Number(d.totalManual||0),linked=Number(d.totalVinculado||0);
  body.innerHTML=
    '<div class="card cs p20 mb14">'
    +'<div class="fb mb12"><div><div class="lup mb4">Total ahorrado</div><div class="ah tok2">'+fmt(d.totalActual||0)+'</div></div>'
    +'<div style="text-align:right"><div class="lup mb4">Meta</div><div class="alg">'+fmt(d.totalPresupuesto||4177)+'</div></div></div>'
    +'<div class="prog h12 mb10"><div class="pf ok" style="width:'+w+'%"></div></div>'
    +'<div class="fb" style="font-size:12px;color:var(--t2)"><span>Completado: <strong>'+pct+'</strong></span><span>Falta: <strong class="tov2">'+fmt(d.faltante||0)+'</strong></span></div>'
    +'</div>'
    +'<div class="settings-goal-summary mb14"><div class="settings-goal-kpi"><span>Aportes manuales</span><b>'+fmt(manual)+'</b></div><div class="settings-goal-kpi"><span>Desde activos</span><b>'+fmt(linked)+'</b></div></div>'
    +'<div class="lup mb10">Ahorro alojado en activos</div><div class="japan-allocation-list">'+(allocations||'<div class="settings-empty">Configura qué activos respaldan el viaje.</div>')+'</div>'
    +'<button class="btn bgh bful mb14" onclick="eid(\'mov-japon\').classList.remove(\'open\');abrirConfiguracion(\'japon\')">Configurar activos de Japón</button>'
    +'<div class="lup mb10">Trámites pre-viaje</div><div class="mb14">'+(tram||'<div class="empty-state">Sin trámites registrados.</div>')+'</div>'
    +'<div class="lup mb10">Desglose del viaje</div><div class="mb14">'+(items||'<div class="empty-state">Sin desglose registrado.</div>')+'</div>'
    +'<div class="lup mb10">Calculadora</div><div class="card cr12 calc-row mb14"><span style="font-size:13px;color:var(--t2)">Si ahorro</span><input type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" id="calc-in" placeholder="200" oninput="calcJ()"><span style="font-size:13px;color:var(--t2)">$/mes</span><div class="cres" id="calc-out">ingresa un monto</div></div>'
    +'<div class="card cr12 p14 mb14"><div style="font-size:13px;color:var(--t2);line-height:1.6">El progreso suma <strong>'+fmt(manual)+'</strong> de aportes manuales y <strong>'+fmt(linked)+'</strong> efectivamente respaldados por activos del Balance. Las asignaciones no mueven ni duplican dinero.</div></div>'
    +'<div class="detail-actions"><button class="btn bb bful" onclick="tgEditJap()">'+(G.japEdit?'Terminar edición':'Editar meta')+'</button><button class="btn bgh bful" onclick="eid(\'mov-japon\').classList.remove(\'open\')">Cerrar</button></div>';
}
function abrirModalJapon(){
  eid('mov-japon').classList.add('open');
  if(G.japon){renderModalJapon(G.japon);return;}
  eid('j-modal-body').innerHTML='<div class="empty-state">Cargando meta Japón...</div>';
  loadJapon();
}
function tgEditJap(){G.japEdit=!G.japEdit;if(G.japon)renderModalJapon(G.japon);showToast(G.japEdit?'Modo edición':'Guardado','ok');}
function saveJap(nombre,valor){
  google.script.run
    .withSuccessHandler(function(res){if(res&&res.ok){showToast('Actualizado','ok');loadJapon();loadHomeJapon();}else showToast('Error','err');})
    .actualizarJapon({item:nombre,monto:valor});
}
function calcJ(){
  var m=moneyVal(eid('calc-in').value);
  if(!m||!G.japon){eid('calc-out').textContent='ingresa un monto';return;}
  var falt=(G.japon.totalPresupuesto||4177)-(G.japon.totalActual||0);
  if(falt<=0){eid('calc-out').textContent='🎌 ¡Meta alcanzada!';return;}
  var meses=Math.ceil(falt/m);
  var fecha=new Date();fecha.setMonth(fecha.getMonth()+meses);
  eid('calc-out').textContent=meses+' meses ('+fecha.toLocaleDateString('es-EC',{month:'long',year:'numeric'})+')';
}

function renderCalendario(){
  var d=G.calFecha,mes=d.getMonth(),anio=d.getFullYear();
  eid('cal-lbl').textContent=new Date(anio,mes,1).toLocaleDateString('es-EC',{month:'long',year:'numeric'});
  var pri=new Date(anio,mes,1).getDay(),dias=new Date(anio,mes+1,0).getDate();
  var hoy=new Date(),evDias={};
  if(G.mesData&&G.mesData.deudas){
    G.mesData.deudas.items.forEach(function(d){if(d.vence&&d.préstamo>0)evDias[parseInt(d.vence)]={nombre:d.nombre,monto:d.préstamo};});
  }
  var cells='';
  for(var i=0;i<pri;i++) cells+='<div class="cd empty"></div>';
  for(var j=1;j<=dias;j++){
    var isH=(hoy.getDate()===j&&hoy.getMonth()===mes&&hoy.getFullYear()===anio);
    var ev=evDias[j];
    cells+='<div class="cd '+(isH?'today':ev?'hev':'')+'">'+j+(ev?'<div style="width:4px;height:4px;border-radius:50%;background:currentColor;margin-top:1px"></div>':'')+'</div>';
  }
  eid('cal-g').innerHTML=cells;
  var evs=Object.keys(evDias);
  eid('cal-evs').innerHTML=evs.length?evs.sort(function(a,b){return a-b;}).map(function(dia){
    var ev=evDias[dia];
    return'<div class="ev-row"><div style="width:10px;height:10px;border-radius:50%;background:var(--over);flex-shrink:0"></div>'
      +'<div style="flex:1"><div style="font-size:14px;font-weight:700">'+ev.nombre+'</div><div style="font-size:11px;color:var(--t3)">Día '+dia+' del mes</div></div>'
      +'<div class="asm tov2">'+fmt(ev.monto)+'</div></div>';
  }).join(''):'<div style="color:var(--t3);font-size:13px;padding:12px">Sin vencimientos</div>';
}
function calPrev(){G.calFecha=new Date(G.calFecha.getFullYear(),G.calFecha.getMonth()-1,1);renderCalendario();}
function calNext(){G.calFecha=new Date(G.calFecha.getFullYear(),G.calFecha.getMonth()+1,1);renderCalendario();}

function loadNotifs(){
  google.script.run
    .withSuccessHandler(function(res){if(!res||!res.ok)return;renderNotifs(res.data||[]);})
    .getNotificaciones();
}
function renderNotifs(ns){
  var nl=ns.filter(function(n){return!n.leida;}).length;
  var b=eid('nb');b.style.display=nl>0?'flex':'none';if(nl>0)b.textContent=nl>9?'9+':nl;
  eid('np-l').innerHTML=ns.length?ns.slice(-10).reverse().map(function(n){
    return'<div class="ni-r" onclick="leerN(\''+n.id+'\')"><div class="nd '+(n.leida?'rd':'')+'"></div>'
      +'<div><div style="font-size:13px;color:var(--t1)">'+n.texto+'</div><div style="font-size:11px;color:var(--t3)">'+n.fecha+'</div></div></div>';
  }).join(''):'<div style="padding:18px 15px;font-size:13px;color:var(--t3);text-align:center">Sin notificaciones</div>';
}
function tgNotif(){G.notifOpen=!G.notifOpen;eid('np').classList.toggle('open',G.notifOpen);}
function leerN(id){google.script.run.withSuccessHandler(function(){loadNotifs();}).marcarNotifLeida(id);}
function marcarTodas(){loadNotifs();eid('np').classList.remove('open');G.notifOpen=false;}

function tgSrch(){G.srchOpen=!G.srchOpen;var inp=eid('si');inp.classList.toggle('open',G.srchOpen);if(G.srchOpen)setTimeout(function(){inp.focus();},300);}

function abrirModal(tipo){
  try{
    tipo=tipo||'egreso';
    var tipoReal=tipoModalInicial(tipo);
    G.tipoModal=tipoReal;
    var modal=eid('mov');
    if(modal) modal.classList.add('open');
    var t={egreso:'Registrar Egreso',ingreso:'Registrar Ingreso',ahorro:'Registrar Ahorro'};
    if(eid('m-ti')) eid('m-ti').textContent=t[tipo]||'Nuevo movimiento';
    if(eid('m-fecha')) eid('m-fecha').value=todayISO();
    if(eid('m-monto')) eid('m-monto').value='';
    if(eid('m-notas')) eid('m-notas').value='';
    setMovimientoTipo(tipoReal);
    var aplicaBox=eid('m-aplica-box'),aplicaSel=eid('m-mes-aplica');
    if(aplicaBox&&aplicaSel){
      aplicaBox.style.display='block';
      var lbl=eid('m-aplica-label');
      if(lbl)lbl.textContent=tipo==='ahorro'?'Aplicar ahorro a mes':'Registrar en mes';
      var mesAplicado=G.mesActual||mesDesdeFechaISO((eid('m-fecha')&&eid('m-fecha').value)||todayISO())||mesActualCalendario();
      var meses=asegurarMesesCliente(G.meses&&G.meses.length?G.meses.slice():[mesAplicado]);
      if(meses.indexOf(mesAplicado)<0)meses.push(mesAplicado);
      meses.sort(function(a,b){return mesOrdenNombre(a)-mesOrdenNombre(b);});
      aplicaSel.innerHTML=meses.map(function(m){return'<option value="'+m+'">'+m+'</option>';}).join('');
      aplicaSel.value=mesAplicado;
    }
    qsa('.tb[data-tipo]').forEach(function(b){
      var bt=b.dataset.tipo;
      if(tipo==='ingreso')     b.style.display=bt==='ingreso'?'flex':'none';
      else if(tipo==='ahorro') b.style.display=bt==='ahorro'?'flex':'none';
      else                     b.style.display=(bt==='necesidad'||bt==='deseo'||bt==='deuda')?'flex':'none';
    });
    if(!G.catalogo){
      loadCatalogo().then(function(){
        if(eid('mov')&&eid('mov').classList.contains('open')) renderMovimientoSubcats(G.tipoModal);
      }).catch(function(e){console.warn('catalogo modal',e);});
    }
    setTimeout(function(){var m=eid('m-monto');if(m)m.focus();},220);
  }catch(e){
    console.error('abrirModal error',e);
    showToast('Error al abrir registro','err');
  }
}
function syncMovimientoMesPorFecha(){
  var sel=eid('m-mes-aplica'),fecha=eid('m-fecha');
  if(!sel||!fecha)return;
  var mesFecha=mesDesdeFechaISO(fecha.value)||G.mesActual;
  if(!mesFecha)return;
  var existe=false;
  for(var i=0;i<sel.options.length;i++){if(sel.options[i].value===mesFecha){existe=true;break;}}
  if(!existe) sel.insertAdjacentHTML('afterbegin','<option value="'+mesFecha+'">'+mesFecha+'</option>');
  if(!sel.value) sel.value=G.mesActual||mesFecha;
}
function cMov(e){if(e.target===eid('mov'))eid('mov').classList.remove('open');}
function tipoModalInicial(tipo){
  return tipo==='ingreso'?'ingreso':tipo==='ahorro'?'ahorro':'necesidad';
}
function normalizarTipoMovimiento(tipo){
  return ['ingreso','ahorro','necesidad','deseo','deuda'].indexOf(tipo)>=0?tipo:'necesidad';
}
function renderMovimientoSubcats(t){
  var sub=eid('m-sub');
  if(!sub)return;
  t=normalizarTipoMovimiento(t);
  var opts=catalogSubcats(t);
  if((t==='ahorro'||t==='deuda')&&(!opts||!opts.length)){
    sub.innerHTML='<option value="">Sin ítems activos</option>';
    if(!G.catalogo){
      loadCatalogo().then(function(){renderMovimientoSubcats(t);})
        .catch(function(){sub.innerHTML='<option value="">No pude cargar opciones</option>';});
    }
    sub.onchange=actualizarBalanceBox;
    return;
  }
  if(!opts||!opts.length)opts=(SUBCATS[t]||[]).slice();
  sub.innerHTML='<option value="">Selecciona...</option>'
    +opts.map(function(s){return'<option value="'+hEsc(s)+'">'+hEsc(s)+'</option>';}).join('');
  sub.onchange=actualizarBalanceBox;
}
function setMovimientoTipo(t){
  t=normalizarTipoMovimiento(t);
  qsa('.tb').forEach(function(b){
    b.className='tb';
    var bt=b.getAttribute('data-tipo')||'';
    if(bt===t){
      var cls={necesidad:'s-nec',deseo:'s-des',deuda:'s-deu',ahorro:'s-aho',ingreso:'s-ing'}[t]||('s-'+t);
      b.classList.add(cls);
    }
  });
  G.tipoModal=t;
  renderMovimientoSubcats(t);
  try{actualizarBalanceBox();}catch(e){console.warn('balance box modal',e);}
}
function selTipo(btn){
  setMovimientoTipo(btn?(btn.getAttribute('data-tipo')||'necesidad'):'necesidad');
}
function guardar(){
  var monto=moneyVal(eid('m-monto').value);
  var sub=eid('m-sub').value,fecha=eid('m-fecha').value;
  if(!monto||monto<=0){showToast('Ingresa un monto válido','err');return;}
  if(!sub){showToast('Selecciona una subcategoría','err');return;}
  if(!G.mesActual){showToast('No hay mes seleccionado','err');return;}
  if(G.tipoModal==='ahorro'||G.tipoModal==='deuda'){
    var itemCatalogo=catalogFind(G.tipoModal,sub);
    var deudaFija=itemCatalogo&&G.tipoModal==='deuda'&&nE(itemCatalogo.grupo)===nE('Pasivos Fijos');
    if(!itemCatalogo){
      showToast('“'+sub+'” no está activo en el catálogo. Corrígelo desde Gestionar antes de registrar.','err');
      return;
    }
    if(!itemCatalogo.balanceId&&!deudaFija){
      showToast('“'+sub+'” no tiene un destino de balance asignado. Corrígelo desde Gestionar.','err');
      return;
    }
  }
  var btn=eid('btn-sv');btn.textContent='Guardando...';btn.disabled=true;
  var mesAplicado=G.mesActual;
  var mesRegistro=mesDesdeFechaISO(fecha)||G.mesActual;
  if(eid('m-mes-aplica')&&eid('m-mes-aplica').value) mesAplicado=eid('m-mes-aplica').value;
  var params={mes:mesAplicado,mesRegistro:mesRegistro,tipo:G.tipoModal,categoria:G.tipoModal,
    subcategoria:sub,monto:String(monto),fecha:fecha,notas:eid('m-notas').value,fast:true,
    returnState:false,homeMes:G.mesActual,histMes:G.histMes||mesAplicado};
  if(eid('m-balance-box')&&eid('m-balance-box').style.display!=='none'){
    params.balanceCodigo=eid('m-balance-dest').value==='__new'?'':eid('m-balance-dest').value;
    params.balanceNombreNuevo=eid('m-balance-new').value.trim();
    params.balanceGrupo=eid('m-balance-grupo').value;
    if(G.tipoModal==='ingreso'&&sub==='Préstamos recibidos'&&!params.balanceCodigo&&!params.balanceNombreNuevo){showToast('Selecciona o crea el pasivo','err');btn.textContent='Guardar';btn.disabled=false;return;}
    if(G.tipoModal==='ingreso'&&sub==='Devolución de ahorro'&&!params.balanceCodigo){showToast('Selecciona el activo de retiro','err');btn.textContent='Guardar';btn.disabled=false;return;}
  }
  var tempId='tmp_'+Date.now();
  aplicarMovimientoHomeLocal(params);
  actualizarSaldoVisiblePorCaja(params);
  insertarMovimientoOptimista(movimientoOptimista(params,tempId,mesRegistro));
  eid('mov').classList.remove('open');
  showSucc();
  showToast('Guardando...','ok');
  google.script.run
    .withSuccessHandler(function(res){
      btn.textContent='Guardar';btn.disabled=false;
      if(res&&res.ok){
        if(res.id&&G.movimientos&&G.movimientos.length){
          G.movimientos.forEach(function(t){if(String(t.id)===tempId)t.id=String(res.id);});
          cacheSetMovimientos(G.histMes,G.movimientos);
        }
        aplicarBalanceImpactosLocal(res.balanceImpactos,res.balanceMonto||monto);
        showToast('Guardado','ok');
        G._dirty=true;G._dirtyFlujo=true;G._dirtyBalance=true;
        cacheDel('mesData_'+mesAplicado);cacheDel('mesData_'+mesRegistro);
        loadCatalogo();
        syncTrasCambio({delay:80,mesInicio:G.mesActual||mesAplicado,mesHist:G.histMes||mesAplicado,historial:true,flujo:true,balance:true});
      }else{
        showToast('Error: '+(res?res.error:'desconocido'),'err');
        syncTrasCambio({delay:80,mesInicio:G.mesActual||mesAplicado,mesHist:G.histMes||mesAplicado,historial:true,flujo:true,balance:true});
      }
    })
    .withFailureHandler(function(e){btn.textContent='Guardar';btn.disabled=false;showToast('No se pudo comunicar con el servidor: '+(e&&e.message?e.message:e||'reintenta la operación.'),'err');syncTrasCambio({delay:80,mesInicio:G.mesActual||mesAplicado,mesHist:G.histMes||mesAplicado,historial:true,flujo:true,balance:true});})
    .registrarMovimiento(params);
}

function crearMesNuevo(){
  var input=prompt('Nombre del mes nuevo (ej: Julio 26):');
  if(!input||!input.trim())return;
  google.script.run
    .withSuccessHandler(function(res){
      if(res&&res.ok){showToast('Mes creado','ok');
        google.script.run.withSuccessHandler(function(r){if(r&&r.ok){G.meses=r.data;fillSels(r.data);}}).getMesesDisponibles();
      }else showToast('Error: '+(res?res.error:''),'err');
    })
    .crearMesNuevo(input.trim());
}

function tgC(id){var el=eid(id);if(el)el.classList.toggle('cop');}

qsa('.ph').forEach(function(ph){
  ph.addEventListener('dblclick',function(){
    G.mesData=null;G.flujo=null;G.balance=null;G.tarjetas=null;G.japon=null;G._dirty=true;
    showToast('Actualizando...','ok');
    cambiarMes(G.mesActual);
    var p=document.querySelector('.page.active');if(!p)return;
    var id=p.id.replace('page-','');
    if(id==='flujo')   {G.flujo=null;  loadFlujo();}
    if(id==='balance') {G.balance=null;loadBalance();}
    if(id==='tarjetas'){G.tarjetas=null;loadTarjetas();}
    if(id==='japon')   {G.japon=null;  loadJapon();}
  });
});

document.addEventListener('click',function(e){
  if(G.notifOpen&&!eid('np').contains(e.target)&&e.target!==eid('btn-notif')){
    eid('np').classList.remove('open');G.notifOpen=false;
  }
});
