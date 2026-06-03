// ============================================================
// Code.gs — Finanzas Personales v9
// ============================================================
var SS_ID   = '1S-Y1kozPzLPKt6iau3Tpe4TKhF7GcczlT8VUZyZTtdU';
var CACHE_S = 300;

var MESES_NOM = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

var ESPECIALES = ['Balance General','Flujo TDC Papi','Flujo de Caja',
                  'Viaje a Japón','Registro','TDC_App','TDC_VISA','TDC_MC','_NOTIF',
                  'Balance_App','_BALANCE_LOG','_BALANCE_DELETED','PINTURAS'];

var TDC_DIFERIDOS = {
  VISA: [{nombre:'Diferido Artefacta', inicial:366.68, cuota:30.56, cuotasAlMesBase:3, mesBase:'May 26'}],
  MC:   [{nombre:'Television Said', inicial:414.95, cuota:34.58, cuotasAlMesBase:6, mesBase:'May 26'}]
};

function getSS(){ return SpreadsheetApp.openById(SS_ID); }
function _n(v){
  if(v===null||v===undefined) return 0;
  var s=String(v).replace(/[$\s]/g,'').replace(',','.');
  if(s.charAt(0)==='('&&s.slice(-1)===')') s='-'+s.slice(1,-1);
  var f=parseFloat(s); return isNaN(f)?0:f;
}
function _s(v){ return String(v||'').trim(); }
function cGet(k){ var r=CacheService.getScriptCache().get(k); return r?JSON.parse(r):null; }
function cPut(k,d){ CacheService.getScriptCache().put(k,JSON.stringify(d),CACHE_S); }
function cDel(k){ CacheService.getScriptCache().remove(k); }
function _nowLocal(){ return Utilities.formatDate(new Date(),'America/Guayaquil','yyyy-MM-dd HH:mm:ss'); }
function _pad2(n){ n=parseInt(n,10)||0; return n<10?'0'+n:String(n); }
function _fechaPartesSimple(v){
  if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime())){
    return {y:v.getUTCFullYear(),m:v.getUTCMonth()+1,d:v.getUTCDate()};
  }
  var s=String(v||'').trim();
  if(!s) return null;
  if(s.indexOf('T')>-1) s=s.split('T')[0];
  var p=s.indexOf('/')>-1?s.split('/'):s.split('-');
  if(p.length===3){
    var y=p[0].length===4?p[0]:p[2],m=p[0].length===4?p[1]:p[1],d=p[0].length===4?p[2]:p[0];
    y=parseInt(y,10);m=parseInt(m,10);d=parseInt(d,10);
    if(y&&m>=1&&m<=12&&d>=1&&d<=31) return {y:y,m:m,d:d};
  }
  var n=new Date(s);
  if(!isNaN(n.getTime())) return {y:n.getUTCFullYear(),m:n.getUTCMonth()+1,d:n.getUTCDate()};
  return null;
}
function _fechaISOTexto(v){
  var p=_fechaPartesSimple(v);
  return p?(p.y+'-'+_pad2(p.m)+'-'+_pad2(p.d)):_s(v);
}
function _fmtFechaSimple(v){
  var p=_fechaPartesSimple(v);
  if(p) return _pad2(p.d)+'/'+_pad2(p.m)+'/'+p.y;
  var s=String(v||'').trim();
  if(!s) return '';
  return s;
}
function _fechaMsSimple(v){
  var p=_fechaPartesSimple(v);
  if(p) return new Date(p.y,p.m-1,p.d,12,0,0).getTime();
  var n2=new Date(String(v||'')).getTime();
  return isNaN(n2)?0:n2;
}
function _st(p,a){
  if(!a||!p) return 'empty';
  var r=a/p; if(r<=0.85) return 'ok'; if(r<=1) return 'warn'; return 'over';
}

function doGet(){
  return HtmlService
    .createHtmlOutputFromFile('index')
    .setTitle('Jaeger Spend')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport','width=device-width,initial-scale=1.0,viewport-fit=cover');
}

// ── HELPERS INTERNOS ────────────────────────────────────────

function _mesCalendarioActual(){
  var hoy=new Date();
  var mes=parseInt(Utilities.formatDate(hoy,'America/Guayaquil','M'),10)-1;
  var yy=Utilities.formatDate(hoy,'America/Guayaquil','yy');
  return MESES_NOM[mes]+' '+yy;
}

function _getMesActual(){
  var ss=getSS();
  var nombre=_mesCalendarioActual();
  var sh=ss.getSheetByName(nombre);
  if(sh) return nombre;
  var sheets=ss.getSheets();
  var ultimo=null;
  sheets.forEach(function(s){
    var n=s.getName();
    if(MESES_NOM.some(function(m){return n.indexOf(m)===0;})) ultimo=n;
  });
  return ultimo;
}

function _getMesIdx(nombre){
  // Devuelve índice 0-11 del mes en el array de meses del año
  var partes=nombre.split(' ');
  return MESES_NOM.indexOf(partes[0]);
}

function _mesOrden(nombre){
  nombre=_normalizarMesNombre(nombre);
  var p=String(nombre||'').split(' ');
  if(p.length!==2) return -1;
  var idx=MESES_NOM.indexOf(p[0]);
  var yy=parseInt(p[1],10);
  if(idx<0||isNaN(yy)) return -1;
  return yy*12+idx;
}

function _mesAnteriorDisponible(ss,mes){
  var orden=_mesOrden(mes),best=null,bestOrden=-1;
  if(orden<0) return null;
  ss.getSheets().forEach(function(sh){
    var n=sh.getName();
    if(ESPECIALES.indexOf(n)!==-1) return;
    var o=_mesOrden(n);
    if(o>=0&&o<orden&&o>bestOrden){best=n;bestOrden=o;}
  });
  return best;
}

// ── API PÚBLICA ──────────────────────────────────────────────

function _saldoFinalRealDeMes(ss,mes){
  try{
    mes=_normalizarMesNombre(mes);
    if(!mes) return null;
    var d=_parseMes(mes);
    if(!d||!d.ok) return null;
    var e=_enriquecerConRegistros(d,mes);
    if(e&&e.vistaGeneral&&e.vistaGeneral.saldoFinal) return _n(e.vistaGeneral.saldoFinal.actual);
  }catch(err){Logger.log('saldo final real '+mes+': '+err);}
  return null;
}

function _saldoSheetConArrastre(ss,mes,vg){
  vg=vg||{};
  var saldoSheet=vg.saldoFinal?_n(vg.saldoFinal.actual):0;
  var saldoInicial=vg.saldoInicial?_n(vg.saldoInicial.actual):null;
  var prev=_mesAnteriorDisponible(ss,mes);
  if(!prev||saldoInicial===null) return saldoSheet;
  var prevSaldo=_saldoFinalRealDeMes(ss,prev);
  if(prevSaldo===null) return saldoSheet;
  return prevSaldo+(saldoSheet-saldoInicial);
}

function getMesesDisponibles(){
  try{
    var ss=getSS(),r=[];
    ss.getSheets().forEach(function(sh){
      var n=sh.getName();
      if(ESPECIALES.indexOf(n)!==-1) return;
      var p=n.split(' ');
      if(p.length===2&&MESES_NOM.some(function(m){return n.indexOf(m)===0;})) r.push(n);
    });
    r.sort(function(a,b){
      var pa=a.split(' '),pb=b.split(' ');
      var ya=parseInt('20'+pa[1]),yb=parseInt('20'+pb[1]);
      return ya!==yb?ya-yb:MESES_NOM.indexOf(pa[0])-MESES_NOM.indexOf(pb[0]);
    });
    return{ok:true,data:r};
  }catch(e){return{ok:false,error:e.toString()};}
}

function getMesData(nombre){
  try{
    var d=_parseMes(nombre);
    if(!d||!d.ok) return d;
    return _enriquecerConRegistros(d,nombre);
  }catch(e){return{ok:false,error:e.toString()};}
}

function _asegurarMesExiste(ss,nombre){
  nombre=_normalizarMesNombre(nombre);
  if(!nombre) return{ok:false,error:'Mes invalido'};
  if(ss.getSheetByName(nombre)) return{ok:true,existe:true};
  return _crearMes(ss,nombre);
}

function getBalanceGeneral(){
  try{
    var d=_parseBalance();
    if(!d||!d.ok) return d;

    // Aplicar deltas de Balance_App
    var app=getBalanceApp();
    if(app&&app.ok&&app.data.length){
      app.data.forEach(function(delta){
        for(var i=0;i<d.activos.length;i++){
          if(d.activos[i].codigo===delta.codigo){
            d.activos[i].valor+=delta.delta;break;
          }
        }
        for(var j=0;j<d.pasivos.length;j++){
          if(d.pasivos[j].codigo===delta.codigo){
            d.pasivos[j].valor+=delta.delta;break;
          }
        }
      });
    }

    var ssBal=getSS();
    var eliminados=_getBalanceDeletedMap(ssBal);
    d.activos=d.activos.filter(function(x){return x.esGrupo||!eliminados[x.codigo];});
    d.pasivos=d.pasivos.filter(function(x){return x.esGrupo||!eliminados[x.codigo];});
    d.cambios=_getBalanceLog(ssBal,6);

    // Sincronizar Efectivo Disponible (10101.05) con saldo real del mes actual
    var mesActual=_getMesActual();
    if(mesActual){
      var mesData=_parseMes(mesActual);
      if(mesData&&mesData.ok){
        var enriquecido=_enriquecerConRegistros(mesData,mesActual);
        var saldoReal=enriquecido.vistaGeneral&&enriquecido.vistaGeneral.saldoFinal
          ?enriquecido.vistaGeneral.saldoFinal.actual:null;
        if(saldoReal!==null){
          for(var k=0;k<d.activos.length;k++){
            if(d.activos[k].codigo==='10101.05'){
              d.activos[k].valor=saldoReal;break;
            }
          }
        }
      }
    }

    // Recalcular totales de grupo y globales
    // Totales de grupo = suma de subcuentas del grupo
    var grupoActual=null;
    var sumaGrupo=0;
    for(var ai=0;ai<d.activos.length;ai++){
      var a=d.activos[ai];
      if(a.esGrupo){
        if(grupoActual!==null) d.activos[grupoActual].valor=sumaGrupo;
        grupoActual=ai;sumaGrupo=0;
      } else {
        sumaGrupo+=a.valor;
      }
    }
    if(grupoActual!==null) d.activos[grupoActual].valor=sumaGrupo;

    d.totalActivos=d.activos.reduce(function(a,x){return x.esGrupo?a:a+x.valor;},0);
    d.totalPasivos=d.pasivos.reduce(function(a,x){return x.esGrupo?a:a+x.valor;},0);
    d.patrimonioNeto=d.totalActivos-d.totalPasivos;

    return d;
  }catch(e){return{ok:false,error:e.toString()};}
}

function _actualizarBalanceLegacy(params){
  try{
    var ss=getSS();
    var sh=ss.getSheetByName('Balance General');
    if(!sh) return{ok:false,error:'Hoja no encontrada'};
    var D=sh.getDataRange().getValues();
    for(var i=0;i<D.length;i++){
      if(_s(D[i][0])===params.codigo){sh.getRange(i+1,3).setValue(parseFloat(params.valor));return{ok:true};}
      if(_s(D[i][5])===params.codigo){sh.getRange(i+1,8).setValue(parseFloat(params.valor));return{ok:true};}
    }
    return{ok:false,error:'Código no encontrado'};
  }catch(e){return{ok:false,error:e.toString()};}
}

function actualizarBalance(params){
  try{
    var ss=getSS();
    var item=_findBalanceItem(ss,params.codigo);
    if(!item) return{ok:false,error:'Codigo no encontrado'};
    var nuevo=_n(params.valor);
    item.sheet.getRange(item.row,item.col).setValue(nuevo);
    _appendBalanceLog(ss,{
      codigo:item.codigo,
      nombre:item.nombre,
      tipo:item.tipo,
      accion:'editar',
      anterior:item.valor,
      nuevo:nuevo,
      nota:params&&params.nota?params.nota:''
    });
    return{ok:true};
  }catch(e){return{ok:false,error:e.toString()};}
}

function eliminarBalanceItem(params){
  try{
    var ss=getSS();
    var item=_findBalanceItem(ss,params.codigo);
    if(!item) return{ok:false,error:'Codigo no encontrado'};
    var nota=params&&params.nota?params.nota:'';
    _balanceDeletedSheet(ss).appendRow([new Date(),item.codigo,item.nombre,item.tipo,nota]);
    _appendBalanceLog(ss,{
      codigo:item.codigo,
      nombre:item.nombre,
      tipo:item.tipo,
      accion:'eliminar',
      anterior:item.valor,
      nuevo:0,
      nota:nota
    });
    return{ok:true};
  }catch(e){return{ok:false,error:e.toString()};}
}

function _findBalanceItem(ss,codigo){
  codigo=_s(codigo);
  if(!codigo) return null;
  var sh=ss.getSheetByName('Balance General');
  if(!sh) return null;
  var D=sh.getDataRange().getValues();
  for(var i=0;i<D.length;i++){
    if(_s(D[i][0])===codigo){
      return{sheet:sh,row:i+1,col:3,codigo:codigo,nombre:_s(D[i][1]),tipo:'Activo',valor:_n(D[i][2])};
    }
    if(_s(D[i][5])===codigo){
      return{sheet:sh,row:i+1,col:8,codigo:codigo,nombre:_s(D[i][6]),tipo:'Pasivo',valor:_n(D[i][7])};
    }
  }
  return null;
}

function _balanceLogSheet(ss){
  var sh=ss.getSheetByName('_BALANCE_LOG');
  if(!sh){
    sh=ss.insertSheet('_BALANCE_LOG');
    sh.appendRow(['Fecha','Codigo','Nombre','Tipo','Accion','Anterior','Nuevo','Nota']);
  }
  return sh;
}

function _balanceDeletedSheet(ss){
  var sh=ss.getSheetByName('_BALANCE_DELETED');
  if(!sh){
    sh=ss.insertSheet('_BALANCE_DELETED');
    sh.appendRow(['Fecha','Codigo','Nombre','Tipo','Nota']);
  }
  return sh;
}

function _appendBalanceLog(ss,r){
  _balanceLogSheet(ss).appendRow([
    new Date(),
    r.codigo||'',
    r.nombre||'',
    r.tipo||'',
    r.accion||'',
    _n(r.anterior),
    _n(r.nuevo),
    r.nota||''
  ]);
}

function _getBalanceDeletedMap(ss){
  var sh=ss.getSheetByName('_BALANCE_DELETED');
  var map={};
  if(!sh) return map;
  var D=sh.getDataRange().getValues();
  for(var i=1;i<D.length;i++){
    var codigo=_s(D[i][1]);
    if(codigo) map[codigo]=true;
  }
  return map;
}

function _getBalanceLog(ss,limit){
  var sh=ss.getSheetByName('_BALANCE_LOG');
  if(!sh) return [];
  var D=sh.getDataRange().getValues();
  var out=[];
  for(var i=D.length-1;i>=1&&out.length<(limit||8);i--){
    out.push({
      fecha:D[i][0],
      codigo:_s(D[i][1]),
      nombre:_s(D[i][2]),
      tipo:_s(D[i][3]),
      accion:_s(D[i][4]),
      anterior:_n(D[i][5]),
      nuevo:_n(D[i][6]),
      nota:_s(D[i][7])
    });
  }
  return out;
}

function getFlujoCaja(){
  try{
    return _parseFlujoCaja();
  }catch(e){return{ok:false,error:e.toString()};}
}

function getViajeJapon(){
  try{return _parseJapon();}catch(e){return{ok:false,error:e.toString()};}
}

function actualizarJapon(params){
  try{
    var ss=getSS();
    var sh=ss.getSheetByName('Viaje a Japón');
    if(!sh) return{ok:false,error:'Hoja no encontrada'};
    var D=sh.getDataRange().getValues();
    for(var i=0;i<D.length;i++){
      if(_s(D[i][1])===params.item){sh.getRange(i+1,4).setValue(parseFloat(params.monto)||0);return{ok:true};}
      if(_s(D[i][6])===params.item){sh.getRange(i+1,9).setValue(parseFloat(params.monto)||0);return{ok:true};}
    }
    return{ok:false,error:'Ítem no encontrado'};
  }catch(e){return{ok:false,error:e.toString()};}
}

function parseTarjetas(){
  try{
    var ss=getSS();
    var shBal=ss.getSheetByName('Balance General');
    if(!shBal) return{ok:false,error:'Hoja Balance General no encontrada'};
    var D=shBal.getDataRange().getValues();

    var meses2026=['Ene 26','Feb 26','Mar 26','Abr 26','May 26','Jun 26',
                   'Jul 26','Ago 26','Sep 26','Oct 26','Nov 26','Dic 26'];
    var conceptos=['Saldo anterior','Consumos','Pagos / Créditos',
                   'Total/ Saldo Rotativo','Saldo Diferido','Saldo Real'];

    var bloqueGC=[],bloquePersonal=[];
    var enGC=false,enPersonal=false;

    for(var i=0;i<D.length;i++){
      var lb=_s(D[i][11]);
      if(lb.indexOf('GC')!==-1&&lb.indexOf('BANCO')!==-1){enGC=true;enPersonal=false;continue;}
      if((lb.indexOf('PERSONAL')!==-1||lb.indexOf('Personal')!==-1)&&lb.indexOf('BANCO')!==-1){enGC=false;enPersonal=true;continue;}
      if(conceptos.indexOf(lb)!==-1){
        var fila={concepto:lb};
        meses2026.forEach(function(m,idx){fila[m]=_n(D[i][12+idx]);});
        if(enGC) bloqueGC.push(fila);
        else if(enPersonal) bloquePersonal.push(fila);
      }
    }

    var shPapi=ss.getSheetByName('Flujo TDC Papi');
    var papi2025=[];
    var meses2025=['Ene 25','Feb 25','Mar 25','Abr 25','May 25','Jun 25',
                   'Jul 25','Ago 25','Sep 25','Oct 25','Nov 25','Dic 25'];
    if(shPapi){
      var DP=shPapi.getDataRange().getValues();
      for(var j=0;j<DP.length;j++){
        var lp=_s(DP[j][0]);
        if(conceptos.indexOf(lp)!==-1){
          var fp={concepto:lp};
          meses2025.forEach(function(m,idx){fp[m]=_n(DP[j][1+idx]);});
          papi2025.push(fp);
        }
      }
    }

    var tarjetas=[
      {id:'VISA',nombre:'Visa Personal',numero:'**** **** **** 4894',
       clase:'visa-card',logo:'visa',
       historial2026:bloquePersonal,meses2026:meses2026,
       historial2025:[],meses2025:[]},
      {id:'MC',nombre:'Mastercard Gold GC',numero:'**** **** **** 9593',
       clase:'mc-card',logo:'mc',
       historial2026:bloqueGC,meses2026:meses2026,
       historial2025:papi2025,meses2025:meses2025}
    ];
    _enriquecerTarjetasConApp(ss, tarjetas);
    return{ok:true,tarjetas:tarjetas};
  }catch(e){return{ok:false,error:e.toString()};}
}

function _enriquecerTarjetasConApp(ss, tarjetas){
  var sh=ss.getSheetByName('TDC_App');
  if(!sh){
    tarjetas.forEach(_recalcularHistorialTdc);
    return;
  }
  var D=sh.getDataRange().getValues();
  for(var i=1;i<D.length;i++){
    var mes=_normalizarMesNombre(D[i][2]),tarjeta=_s(D[i][3]),tipo=_s(D[i][4]),monto=_n(D[i][5]);
    if(!mes||!tarjeta||!tipo||!monto) continue;
    var mesCorto=_mesLargoACorto(mes);
    tarjetas.forEach(function(t){
      if(t.id!==tarjeta) return;
      var hist=t.historial2026,meses=t.meses2026,idx=meses.indexOf(mesCorto);
      if(idx<0) return;
      _sumarFilaTdc(hist,'Consumos',mesCorto,tipo==='cargo'?monto:0);
      _sumarFilaTdc(hist,'Pagos / Créditos',mesCorto,tipo==='abono'?monto:0);
    });
  }
  tarjetas.forEach(_recalcularHistorialTdc);
}

function _recalcularHistorialTdc(t){
  var hist=t.historial2026||[],meses=t.meses2026||[];
  if(!hist.length||!meses.length) return;
  var saldoAnt=_filaTdc(hist,'Saldo anterior');
  var consumos=_filaTdc(hist,'Consumos');
  var pagos=_filaTdc(hist,'Pagos / Créditos');
  var rotativo=_filaTdc(hist,'Total/ Saldo Rotativo');
  var diferido=_filaTdc(hist,'Saldo Diferido');
  var real=_filaTdc(hist,'Saldo Real');

  meses.forEach(function(m,idx){
    if(idx>0) saldoAnt[m]=_tdcMoney(rotativo[meses[idx-1]]);
    diferido[m]=_calcularSaldoDiferidoTdc(t.id,m,diferido[m]);
    rotativo[m]=_tdcMoney((saldoAnt[m]||0)+(consumos[m]||0)-(pagos[m]||0));
    real[m]=_tdcMoney((rotativo[m]||0)+(diferido[m]||0));
  });
}

function _filaTdc(hist, concepto){
  for(var i=0;i<hist.length;i++){
    if(hist[i].concepto===concepto) return hist[i];
  }
  var fila={concepto:concepto};
  hist.push(fila);
  return fila;
}

function _calcularSaldoDiferidoTdc(tarjeta, mesCorto, valorHoja){
  var cfg=TDC_DIFERIDOS[tarjeta]||[];
  if(!cfg.length) return _tdcMoney(valorHoja||0);
  var total=0;
  cfg.forEach(function(d){
    var idxMes=_idxMesCorto(mesCorto),idxBase=_idxMesCorto(d.mesBase);
    if(idxMes<0||idxBase<0){total+=_n(valorHoja);return;}
    var cuotasCobradas=(d.cuotasAlMesBase||0)+(idxMes-idxBase);
    if(cuotasCobradas<0) cuotasCobradas=0;
    var saldo=(d.inicial||0)-((d.cuota||0)*cuotasCobradas);
    total+=Math.max(0,saldo);
  });
  return _tdcMoney(total);
}

function _idxMesCorto(mesCorto){
  var abbr=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return abbr.indexOf(String(mesCorto||'').split(' ')[0]);
}

function getTarjetasState(opts){
  try{
    opts=opts||{};
    var parsed=parseTarjetas();
    if(!parsed||!parsed.ok) return parsed;
    var tarjetas=parsed.tarjetas||[];
    var idx=parseInt(opts.idx,10);
    if(isNaN(idx)||idx<0||idx>=tarjetas.length) idx=0;
    var anio=parseInt(opts.anio,10)||2026;
    var t=tarjetas[idx]||tarjetas[0];
    var mes=_normalizarMesNombre(opts.mes)||_mesCalendarioActual();
    if(t){
      var meses=(anio===2026?t.meses2026:t.meses2025)||[];
      var cortos=meses.map(function(m){
        var p=String(m||'').split(' ');
        var mi=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].indexOf(p[0]);
        return (mi>=0?MESES_NOM[mi]:p[0])+' '+p[1];
      });
      if(cortos.length&&cortos.indexOf(mes)<0) mes=cortos[cortos.length-1];
    }
    var out={ok:true,tarjetas:tarjetas,tcIdx:idx,tdcAnio:anio,tcMesActual:mes,tdcMovs:[],tdcMovsAplicados:[]};
    if(t&&t.id){
      var movs=getMovimientosTarjeta(mes,t.id);
      out.tdcMovs=movs&&movs.ok?(movs.data||[]):[];
      var movsAplicados=getMovimientosTarjeta(_mesSiguienteNombre(mes),t.id);
      out.tdcMovsAplicados=movsAplicados&&movsAplicados.ok?(movsAplicados.data||[]):[];
      out.tdcKey=t.id+'|'+mes;
    }
    return out;
  }catch(e){return{ok:false,error:e.toString()};}
}

function _tdcMoney(v){
  var n=Math.round((_n(v)+Number.EPSILON)*100)/100;
  return Math.abs(n)<0.005?0:n;
}

function _mesLargoACorto(mes){
  var normal=_normalizarMesNombre(mes);
  var p=String(normal||'').split(' ');
  return p.length>=2?p[0].slice(0,3)+' '+p[1]:'';
}

function _normalizarMesNombre(mes){
  if(Object.prototype.toString.call(mes)==='[object Date]'&&!isNaN(mes.getTime())){
    return MESES_NOM[mes.getMonth()]+' '+String(mes.getFullYear()).slice(-2);
  }
  var p=String(mes||'').trim().replace(/\s+/g,' ').split(' ');
  if(p.length<2) return String(mes||'').trim();
  var mesRaw=p[0].toLowerCase();
  var idx=-1;
  for(var i=0;i<MESES_NOM.length;i++){
    if(MESES_NOM[i].toLowerCase()===mesRaw||MESES_NOM[i].slice(0,3).toLowerCase()===mesRaw.slice(0,3)){
      idx=i;break;
    }
  }
  var yy=String(p[1]).replace(/\D/g,'');
  if(yy.length===4) yy=yy.slice(-2);
  if(yy.length===1) yy='0'+yy;
  return (idx>=0?MESES_NOM[idx]:p[0].charAt(0).toUpperCase()+p[0].slice(1).toLowerCase())+' '+yy;
}

function _mesDesdeFechaMovimiento(fecha){
  var p=_fechaPartesSimple(fecha);
  if(!p) return '';
  return MESES_NOM[p.m-1]+' '+String(p.y).slice(-2);
}

function _mesSiguienteNombre(mes){
  mes=_normalizarMesNombre(mes);
  var p=String(mes||'').split(' ');
  if(p.length<2) return '';
  var idx=MESES_NOM.indexOf(p[0]),yy=parseInt(p[1],10);
  if(idx<0||isNaN(yy)) return '';
  idx++;
  if(idx>11){idx=0;yy++;}
  return MESES_NOM[idx]+' '+String(yy).padStart(2,'0');
}

function _sumarFilaTdc(hist, concepto, mesCorto, monto){
  if(!monto) return;
  for(var i=0;i<hist.length;i++){
    if(hist[i].concepto===concepto){
      hist[i][mesCorto]=(hist[i][mesCorto]||0)+monto;
      return;
    }
  }
}

function registrarMovimientoTarjeta(params){
  try{
    var ss=getSS();
    var tipo=_s(params.tipo);
    var monto=parseFloat(String(params.monto).replace(',','.'))||0;
    if(['cargo','abono'].indexOf(tipo)===-1) return{ok:false,error:'Tipo TDC inválido'};
    if(!monto||monto<=0) return{ok:false,error:'Monto inválido'};
    var mes=_normalizarMesNombre(params.mesAplica||params.mesAplicado||params.mes);
    var mesCajaPorFecha=_mesDesdeFechaMovimiento(params.fecha);
    var mesRegistro=_normalizarMesNombre(params.mesRegistro||mesCajaPorFecha||params.mes);
    var tarjeta=_s(params.tarjeta);
    if(['VISA','MC'].indexOf(tarjeta)===-1) return{ok:false,error:'Tarjeta inválida'};

    var registroId='',mesDataCaja=null,mesCajaRespuesta=mesRegistro;
    if(tipo==='abono'&&params.origen==='egreso'){
      var r=registrarMovimiento({
        mes:mes,
        mesRegistro:mesRegistro,
        tipo:params.egresoTipo||'deuda',
        categoria:params.egresoTipo||'deuda',
        subcategoria:params.subcategoria||'Prestamos TDC',
        monto:String(monto),
        fecha:params.fecha,
        notas:(params.notas?params.notas+' · ':'')+'Abono '+tarjeta
      });
      if(!r||!r.ok) return r;
      registroId=r.id||'';
      mesDataCaja=r.mesData||null;
      mesCajaRespuesta=r.mesCaja||mesRegistro;
    }

    var sh=ss.getSheetByName('TDC_App');
    if(!sh){
      sh=ss.insertSheet('TDC_App');
      sh.appendRow(['ID','Timestamp','Mes','Tarjeta','Tipo','Monto','Fecha','Notas','Origen','RegistroID','Categoria','Subcategoria','CargoID']);
      sh.setFrozenRows(1);
    }else if(sh.getLastColumn()<13){
      sh.getRange(1,13).setValue('CargoID');
    }
    var id=new Date().getTime().toString();
    sh.appendRow([
      id,new Date().toISOString(),mes,tarjeta,tipo,monto,_fechaISOTexto(params.fecha)||'',params.notas||'',
      params.origen||'',registroId,params.egresoTipo||'',params.subcategoria||'',params.cargoId||''
    ]);
    var ultimaFila=sh.getLastRow();
    sh.getRange(ultimaFila,3).setNumberFormat('@STRING@').setValue(mes);
    sh.getRange(ultimaFila,7).setNumberFormat('@STRING@').setValue(_fechaISOTexto(params.fecha));
    var mesCaja=_mesDesdeFechaMovimiento(params.fecha);
    cDel('flujo');
    cDel('mes_'+mes.replace(/ /g,'_'));
    cDel('mes_'+mesRegistro.replace(/ /g,'_'));
    if(mesCaja) cDel('mes_'+mesCaja.replace(/ /g,'_'));
    SpreadsheetApp.flush();
    if(!mesDataCaja&&tipo==='abono'&&params.origen==='egreso') mesDataCaja=getMesData(mesCajaRespuesta);
    return{ok:true,id:id,registroId:registroId,mesData:mesDataCaja,mesCaja:mesCajaRespuesta,mesAplicado:mes};
  }catch(e){return{ok:false,error:e.toString()};}
}

function getMovimientosTarjeta(mes,tarjeta){
  try{
    var ss=getSS();
    var sh=ss.getSheetByName('TDC_App');
    if(!sh) return{ok:true,data:[]};
    var mesBuscado=_normalizarMesNombre(mes);
    var D=sh.getDataRange().getValues(),result=[];
    for(var i=1;i<D.length;i++){
      var mesFila=_normalizarMesNombre(_s(D[i][2]).replace(/^'+/,''));
      if(mesFila!==mesBuscado||_s(D[i][3])!==tarjeta) continue;
      result.push({
        id:_s(D[i][0]),orden:i,timestamp:_s(D[i][1]),mes:mesFila,tarjeta:_s(D[i][3]),
        tipo:_s(D[i][4]),monto:_n(D[i][5]),fecha:_fmtFechaSimple(D[i][6]),fechaOrden:_fechaMsSimple(D[i][6]),notas:_s(D[i][7]),
        origen:_s(D[i][8]),registroId:_s(D[i][9]),categoria:_s(D[i][10]),subcategoria:_s(D[i][11]),cargoId:_s(D[i][12])
      });
    }
    result.sort(function(a,b){
      return (b.fechaOrden||0)-(a.fechaOrden||0)||(a.orden||0)-(b.orden||0);
    });
    return{ok:true,data:result};
  }catch(e){return{ok:false,error:e.toString()};}
}

function actualizarMovimientoTarjeta(params){
  try{
    var ss=getSS();
    var sh=ss.getSheetByName('TDC_App');
    if(!sh) return{ok:false,error:'Hoja TDC_App no encontrada'};
    if(sh.getLastColumn()<13) sh.getRange(1,13).setValue('CargoID');
    var D=sh.getDataRange().getValues();
    for(var i=1;i<D.length;i++){
      if(String(D[i][0])!==String(params.id)) continue;
      var oldMes=_s(D[i][2]).replace(/^'+/,'');
      var oldTipo=_s(D[i][4]);
      var oldOrigen=_s(D[i][8]);
      var oldRegistroId=_s(D[i][9]);
      var mes=_normalizarMesNombre(params.mesAplica||params.mesAplicado||params.mes||oldMes);
      var mesCajaPorFecha=_mesDesdeFechaMovimiento(params.fecha);
      var mesRegistro=_normalizarMesNombre(params.mesRegistro||mesCajaPorFecha||params.mes||oldMes);
      var tipo=_s(params.tipo||oldTipo);
      var monto=parseFloat(String(params.monto).replace(',','.'))||0;
      if(['cargo','abono'].indexOf(tipo)===-1) return{ok:false,error:'Tipo TDC inválido'};
      if(!monto||monto<=0) return{ok:false,error:'Monto inválido'};

      var registroId=oldRegistroId,mesDataCaja=null,mesCajaRespuesta=mesRegistro;
      if(oldRegistroId&&!(tipo==='abono'&&params.origen==='egreso')){
        eliminarMovimiento(oldRegistroId);
        registroId='';
      }
      if(tipo==='abono'&&params.origen==='egreso'){
        var movParams={
          id:oldRegistroId,
          mes:mes,
          mesRegistro:mesRegistro,
          tipo:params.egresoTipo||'deuda',
          categoria:params.egresoTipo||'deuda',
          subcategoria:params.subcategoria||'Prestamos TDC',
          monto:String(monto),
          fecha:params.fecha,
          notas:(params.notas?params.notas+' · ':'')+'Abono '+_s(params.tarjeta)
        };
        if(oldRegistroId&&oldOrigen==='egreso'){
          var up=actualizarMovimiento(movParams);
          if(!up||!up.ok) return up;
          mesDataCaja=up.mesData||null;
          mesCajaRespuesta=up.mesCaja||mesRegistro;
        }else{
          var cr=registrarMovimiento(movParams);
          if(!cr||!cr.ok) return cr;
          registroId=cr.id||'';
          mesDataCaja=cr.mesData||null;
          mesCajaRespuesta=cr.mesCaja||mesRegistro;
        }
      }

      sh.getRange(i+1,3,1,11).setValues([[
        mes,_s(params.tarjeta),tipo,monto,_fechaISOTexto(params.fecha)||'',params.notas||'',
        params.origen||'',registroId,params.egresoTipo||'',params.subcategoria||'',params.cargoId||''
      ]]);
      sh.getRange(i+1,3).setNumberFormat('@STRING@').setValue(mes);
      sh.getRange(i+1,7).setNumberFormat('@STRING@').setValue(_fechaISOTexto(params.fecha));
      sh.getRange(i+1,3).setNumberFormat('@STRING@').setValue(mes);
      var mesCaja=_mesDesdeFechaMovimiento(params.fecha);
      cDel('flujo');cDel('mes_'+oldMes.replace(/ /g,'_'));cDel('mes_'+mes.replace(/ /g,'_'));cDel('mes_'+mesRegistro.replace(/ /g,'_'));
      if(mesCaja) cDel('mes_'+mesCaja.replace(/ /g,'_'));
      SpreadsheetApp.flush();
      if(tipo==='abono'&&params.origen==='egreso'&&!mesDataCaja) mesDataCaja=getMesData(mesCajaRespuesta);
      return{ok:true,mesData:mesDataCaja,mesCaja:mesCajaRespuesta,mesAplicado:mes};
    }
    return{ok:false,error:'Movimiento TDC no encontrado'};
  }catch(e){return{ok:false,error:e.toString()};}
}

function eliminarMovimientoTarjeta(id){
  try{
    var ss=getSS();
    var sh=ss.getSheetByName('TDC_App');
    if(!sh) return{ok:false,error:'Hoja TDC_App no encontrada'};
    var D=sh.getDataRange().getValues();
    for(var i=1;i<D.length;i++){
      if(String(D[i][0])!==String(id)) continue;
      var mes=_s(D[i][2]).replace(/^'+/,'');
      var registroId=_s(D[i][9]);
      var del=null;
      if(registroId) del=eliminarMovimiento(registroId);
      sh.deleteRow(i+1);
      cDel('flujo');cDel('mes_'+mes.replace(/ /g,'_'));
      SpreadsheetApp.flush();
      return{ok:true,mesData:del&&del.mesData?del.mesData:null,mesCaja:del&&del.mesCaja?del.mesCaja:null};
    }
    return{ok:false,error:'Movimiento TDC no encontrado'};
  }catch(e){return{ok:false,error:e.toString()};}
}

// ── REGISTRO ─────────────────────────────────────────────────

var BALANCE_MAP = {
  'Aporte Seguro':      [{codigo:'10101.06', op:'activo', signo:1}],
  'Aporte caja':        [{codigo:'10101.01', op:'activo', signo:1}],
  'Programado Tulcán':  [{codigo:'10101.02', op:'activo', signo:1}],
  'Programado Caja':    [{codigo:'10101.04', op:'activo', signo:1}],
  'Ahorro Flexible':    [{codigo:'10102.02', op:'activo', signo:1}],
  'Devolucion Ahorro 1':[{codigo:'10102.02', op:'activo', signo:1}],
  'Devolucion ahorro 2':[{codigo:'10102.02', op:'activo', signo:1}],
  'Inversión XTB':      [{codigo:'10102.05', op:'activo', signo:1}],
  'Diferido Artefacta': [{codigo:'2010301.2',op:'pasivo', signo:-1}],
  'Devolución Terreno': [
    {codigo:'2010401.3', op:'pasivo', signo:-1},
    {codigo:'10102.06',  op:'activo', signo:1}
  ]
};

function registrarMovimiento(params){
  try{
    var ss=getSS();
    var mes=params.mes;
    mes=mes.charAt(0).toUpperCase()+mes.slice(1);
    var mesCaja=_normalizarMesNombre(params.mesRegistro||_mesDesdeFechaMovimiento(params.fecha)||mes);
    mes=_normalizarMesNombre(mes)||mesCaja;
    var asegurarAplicado=_asegurarMesExiste(ss,mes);
    if(!asegurarAplicado.ok) return asegurarAplicado;
    if(mesCaja&&mesCaja!==mes){
      var asegurarCaja=_asegurarMesExiste(ss,mesCaja);
      if(!asegurarCaja.ok) return asegurarCaja;
    }

    // 1. Escribir en hoja Registro
    var reg=ss.getSheetByName('Registro');
    if(!reg){
      reg=ss.insertSheet('Registro');
      reg.appendRow(['ID','Timestamp','Mes','Tipo','Categoria','Subcategoria','Monto','Fecha','Notas','MesCaja']);
      reg.setFrozenRows(1);
    }
    _asegurarRegistroMesCaja(reg);
    var id=new Date().getTime().toString();
    reg.appendRow([
      id, _nowLocal(), mes, params.tipo, params.categoria,
      params.subcategoria,
      parseFloat(String(params.monto).replace(',','.'))||0,
      _fechaISOTexto(params.fecha), params.notas||'', mesCaja
    ]);
    var ultimaFila=reg.getLastRow();
    reg.getRange(ultimaFila,3).setNumberFormat('@STRING@').setValue(mes);
    reg.getRange(ultimaFila,8).setNumberFormat('@STRING@').setValue(_fechaISOTexto(params.fecha));
    reg.getRange(ultimaFila,10).setNumberFormat('@STRING@').setValue(mesCaja);

    // 2. Actualizar Balance_App si el ítem tiene impacto en balance
    var monto=parseFloat(String(params.monto).replace(',','.'))||0;
    var impactos=BALANCE_MAP[params.subcategoria];
    if(impactos){
      _actualizarBalanceApp(ss, impactos, monto);
    }

    // 3. Invalidar caché
    cDel('mes_'+mes.replace(/ /g,'_'));
    if(mesCaja&&mesCaja!==mes) cDel('mes_'+mesCaja.replace(/ /g,'_'));
    cDel('flujo');

    // 4. Notificar excesos
    _checkExceso(ss, params);

    SpreadsheetApp.flush();
    return{ok:true,id:id,mesData:getMesData(mesCaja),mesCaja:mesCaja};
  }catch(e){return{ok:false,error:e.toString()};}
}

function _asegurarRegistroMesCaja(reg){
  var lastCol=reg.getLastColumn();
  if(lastCol<10){
    reg.getRange(1,10).setValue('MesCaja');
  }
  var header=_s(reg.getRange(1,10).getValue());
  if(header!=='MesCaja') reg.getRange(1,10).setValue('MesCaja');
  var lastRow=reg.getLastRow();
  if(lastRow<=1) return;
  var rows=reg.getRange(2,1,lastRow-1,10).getValues();
  var updates=[];
  var changed=false;
  for(var i=0;i<rows.length;i++){
    var mesCaja=_normalizarMesNombre(_s(rows[i][9]));
    if(!mesCaja){
      mesCaja=_normalizarMesNombre(_mesDesdeFechaMovimiento(rows[i][7])||_s(rows[i][2]).replace(/^'+/,''));
      changed=true;
    }
    updates.push([mesCaja]);
  }
  if(changed) reg.getRange(2,10,updates.length,1).setNumberFormat('@STRING@').setValues(updates);
}

function _mesCajaRegistro(fila){
  var mesFila=_normalizarMesNombre(_s(fila[2]).replace(/^'+/,''));
  var mesFecha=_mesDesdeFechaMovimiento(fila[7]);
  var mesGuardado=_normalizarMesNombre(_s(fila[9]));
  if(mesGuardado&&mesFecha&&mesGuardado===mesFila&&mesFecha!==mesFila) return mesFecha;
  return mesGuardado||mesFecha||mesFila;
}

function _actualizarBalanceApp(ss, impactos, monto){
  var sh=ss.getSheetByName('Balance_App');
  if(!sh){
    sh=ss.insertSheet('Balance_App');
    sh.appendRow(['Codigo','Operacion','Delta','UltimaActualizacion']);
    sh.setFrozenRows(1);
  }
  var D=sh.getDataRange().getValues();
  impactos.forEach(function(imp){
    var found=false;
    for(var i=1;i<D.length;i++){
      if(_s(D[i][0])===imp.codigo){
        var nuevoVal=_n(D[i][2])+(monto*imp.signo);
        sh.getRange(i+1,3).setValue(nuevoVal);
        sh.getRange(i+1,4).setValue(new Date().toISOString());
        found=true;break;
      }
    }
    if(!found){
      sh.appendRow([imp.codigo, imp.op, monto*imp.signo, new Date().toISOString()]);
    }
  });
}

function getBalanceApp(){
  try{
    var ss=getSS();
    var sh=ss.getSheetByName('Balance_App');
    if(!sh) return{ok:true,data:[]};
    var D=sh.getDataRange().getValues();
    var result=[];
    for(var i=1;i<D.length;i++){
      if(D[i][0]) result.push({
        codigo:_s(D[i][0]),
        op:_s(D[i][1]),
        delta:_n(D[i][2]),
        fecha:_s(D[i][3])
      });
    }
    return{ok:true,data:result};
  }catch(e){return{ok:false,error:e.toString()};}
}

function _checkExceso(ss,params){
  try{
    if(params.tipo==='ingreso'||params.tipo==='ahorro') return;
    var d=_parseMes(params.mes);if(!d||!d.ok) return;
    var d2=_enriquecerConRegistros(d,params.mes);
    var todos=(d2.necesidades.items||[]).concat(d2.deseos.items||[]);
    var item=null;
    todos.forEach(function(it){
      if(it.nombre.toLowerCase()===params.subcategoria.toLowerCase()) item=it;
    });
    if(!item||item.status!=='over') return;
    var sh=ss.getSheetByName('_NOTIF');
    if(!sh){sh=ss.insertSheet('_NOTIF');sh.appendRow(['ID','Texto','Fecha','Leida']);}
    sh.appendRow([
      new Date().getTime().toString(),
      '⚠️ Excediste "'+item.nombre+'" en $'+(item.actual-item.presupuesto).toFixed(2),
      new Date().toLocaleDateString('es-EC'),false
    ]);
  }catch(e){}
}

function getDesgloseSub(mes,subcategoria){
  try{
    var ss=getSS();
    var reg=ss.getSheetByName('Registro');
    if(!reg) return{ok:true,data:[]};
    var D=reg.getDataRange().getValues(),result=[];
    for(var i=1;i<D.length;i++){
      var mesFila=_s(D[i][2]).replace(/^'+/,'');
      if(mesFila===mes&&_s(D[i][5])===subcategoria)
        result.push({id:_s(D[i][0]),tipo:_s(D[i][3]),categoria:_s(D[i][4]),subcategoria:_s(D[i][5]),fecha:_fmtFechaSimple(D[i][7]),monto:_n(D[i][6]),notas:_s(D[i][8])});
    }
    return{ok:true,data:result};
  }catch(e){return{ok:false,error:e.toString()};}
}

function getMovimientosMes(mes){
  try{
    mes=_normalizarMesNombre(mes);
    var ss=getSS();
    var reg=ss.getSheetByName('Registro');
    if(!reg) return{ok:true,data:[]};
    var D=reg.getDataRange().getValues(),result=[];
    var mesesCaja={}, filas=[];
    for(var i=1;i<D.length;i++){
      var mesFila=_normalizarMesNombre(_s(D[i][2]).replace(/^'+/,''));
      var mesCaja=_normalizarMesNombre(_mesCajaRegistro(D[i]));
      var item={
        id:_s(D[i][0]),
        orden:i,
        timestamp:_s(D[i][1]),
        mes:mesFila,
        mesCaja:mesCaja,
        tipo:_s(D[i][3]),
        categoria:_s(D[i][4]),
        subcategoria:_s(D[i][5]),
        monto:_n(D[i][6]),
        fecha:_fmtFechaSimple(D[i][7]),
        fechaOrden:_fechaMsSimple(D[i][7]),
        notas:_s(D[i][8])
      };
      filas.push(item);
      if(mesFila!==mes) continue;
      mesesCaja[mesCaja]=true;
      result.push(item);
    }
    var saldosPorId={};
    Object.keys(mesesCaja).forEach(function(mc){
      var movs=filas.filter(function(x){return x.mesCaja===mc;});
      movs.sort(_compararMovimientoAsc);
      var saldo=_getSaldoBaseMovimientos(mc);
      movs.forEach(function(t){
        var delta=t.tipo==='ingreso'?t.monto:-t.monto;
        saldo+=delta;
        saldosPorId[t.id]=Math.round((saldo+Number.EPSILON)*100)/100;
      });
    });
    result.forEach(function(t){t.saldoDespues=saldosPorId[t.id];});
    result.sort(_compararMovimientoVista);
    return{ok:true,data:result,saldoBase:_getSaldoBaseMovimientos(mes)};
  }catch(e){return{ok:false,error:e.toString()};}
}

function _catDistribConfig(categoria,mes){
  categoria=_s(categoria);
  var key=categoria.toLowerCase();
  var esDic25=_normalizarMesNombre(mes)==='Diciembre 25';
  if(key==='necesidades') return{categoria:'Necesidades',nameCol:6,budgetCol:7,actualCol:8,sobranteCol:9,width:4,label:'Presupuesto'};
  if(key==='deseos')      return{categoria:'Deseos',nameCol:11,budgetCol:12,actualCol:13,sobranteCol:14,width:4,label:'Presupuesto'};
  if(key==='deudas')      return esDic25
    ?{categoria:'Deudas',nameCol:16,budgetCol:18,actualCol:19,sobranteCol:0,width:4,label:'Prestamo'}
    :{categoria:'Deudas',nameCol:16,budgetCol:17,actualCol:18,sobranteCol:0,width:3,label:'Prestamo'};
  if(key==='ahorros')     return{categoria:'Ahorros',nameCol:2,budgetCol:3,actualCol:4,sobranteCol:0,width:3,label:'Presupuesto'};
  return null;
}

function _catDistribBlock(sh,cfg){
  var D=sh.getDataRange().getValues();
  var i,start,total;
  if(cfg.categoria==='Necesidades'){
    for(i=0;i<D.length;i++){
      if(_s(D[i][6])==='Presupuesto'&&_s(D[i][7])==='Actual'){start=i+2;break;}
    }
    for(i=start-1;i<D.length;i++){if(_s(D[i][5])==='Total'){total=i+1;break;}}
  }else if(cfg.categoria==='Deseos'){
    for(i=0;i<D.length;i++){
      if(_s(D[i][11])==='Presupuesto'&&_s(D[i][12])==='Actual'){start=i+2;break;}
    }
    for(i=start-1;i<D.length;i++){if(_s(D[i][10])==='Total'){total=i+1;break;}}
  }else if(cfg.categoria==='Deudas'){
    for(i=0;i<D.length;i++){
      if((_s(D[i][16])==='Prestamo'||_s(D[i][16])==='Vence')&&(_s(D[i][17])==='Actual'||_s(D[i][17])==='Prestamo')){start=i+2;break;}
    }
    for(i=start-1;i<D.length;i++){if(_s(D[i][15])==='Total'){total=i+1;break;}}
  }else if(cfg.categoria==='Ahorros'){
    for(i=0;i<D.length;i++){
      if(_s(D[i][1])==='Ahorros'&&i>=26){start=i+2;break;}
    }
    for(i=start-1;i<D.length;i++){if(_s(D[i][1])==='Total'){total=i+1;break;}}
  }
  if(!start||!total||total<=start) throw new Error('No se encontro el bloque de '+cfg.categoria);
  return{data:D,startRow:start,totalRow:total};
}

function _findCatDistribRow(block,cfg,nombre){
  nombre=_s(nombre).toLowerCase();
  for(var r=block.startRow;r<block.totalRow;r++){
    if(_s(block.data[r-1][cfg.nameCol-1]).toLowerCase()===nombre) return r;
  }
  return 0;
}

function _updateRegistroSubcategoriaMes(ss,mes,oldNombre,newNombre){
  var reg=ss.getSheetByName('Registro');
  if(!reg) return 0;
  var D=reg.getDataRange().getValues(),count=0;
  for(var i=1;i<D.length;i++){
    var mesFila=_normalizarMesNombre(_s(D[i][2]).replace(/^'+/,''));
    if(mesFila===mes&&_s(D[i][5])===oldNombre){
      reg.getRange(i+1,6).setValue(newNombre);
      count++;
    }
  }
  return count;
}

function gestionarItemCategoria(params){
  try{
    params=params||{};
    var ss=getSS();
    var mes=_normalizarMesNombre(params.mes);
    var accion=_s(params.accion||params.action).toLowerCase();
    var categoria=_s(params.categoria);
    var nombre=_s(params.nombre);
    var oldNombre=_s(params.oldNombre||params.item);
    var valor=_n(params.presupuesto);
    if(!mes) return{ok:false,error:'Mes invalido'};
    if(!accion) return{ok:false,error:'Accion invalida'};
    var sh=ss.getSheetByName(mes);
    if(!sh) return{ok:false,error:'Hoja no encontrada: '+mes};
    var cfg=_catDistribConfig(categoria,mes);
    if(!cfg) return{ok:false,error:'Categoria no soportada: '+categoria};
    var block=_catDistribBlock(sh,cfg);

    if(accion==='agregar'||accion==='add'){
      if(!nombre) return{ok:false,error:'Escribe el nombre del item'};
      if(_findCatDistribRow(block,cfg,nombre)) return{ok:false,error:'Ese item ya existe'};
      var row=block.totalRow;
      sh.insertRowsBefore(row,1);
      var src=Math.max(block.startRow,row-1);
      if(src&&src!==row){
        sh.getRange(src,cfg.nameCol,1,cfg.width).copyTo(sh.getRange(row,cfg.nameCol,1,cfg.width),SpreadsheetApp.CopyPasteType.PASTE_FORMAT,false);
      }
      sh.getRange(row,cfg.nameCol).setValue(nombre);
      sh.getRange(row,cfg.budgetCol).setValue(valor);
      sh.getRange(row,cfg.actualCol).setValue(0);
      if(cfg.sobranteCol) sh.getRange(row,cfg.sobranteCol).setValue(valor);
    }else if(accion==='editar'||accion==='edit'){
      if(!oldNombre) return{ok:false,error:'Selecciona el item a editar'};
      if(!nombre) return{ok:false,error:'Escribe el nuevo nombre'};
      var erow=_findCatDistribRow(block,cfg,oldNombre);
      if(!erow) return{ok:false,error:'Item no encontrado'};
      if(nombre.toLowerCase()!==oldNombre.toLowerCase()&&_findCatDistribRow(block,cfg,nombre)) return{ok:false,error:'Ya existe un item con ese nombre'};
      sh.getRange(erow,cfg.nameCol).setValue(nombre);
      sh.getRange(erow,cfg.budgetCol).setValue(valor);
      if(cfg.sobranteCol){
        var actual=_n(sh.getRange(erow,cfg.actualCol).getValue());
        sh.getRange(erow,cfg.sobranteCol).setValue(valor-actual);
      }
      if(nombre!==oldNombre) _updateRegistroSubcategoriaMes(ss,mes,oldNombre,nombre);
    }else if(accion==='eliminar'||accion==='delete'){
      if(!oldNombre) return{ok:false,error:'Selecciona el item a eliminar'};
      var drow=_findCatDistribRow(block,cfg,oldNombre);
      if(!drow) return{ok:false,error:'Item no encontrado'};
      var data=getMesData(mes);
      var sec={Necesidades:data.necesidades,Deseos:data.deseos,Deudas:data.deudas,Ahorros:data.ahorros}[cfg.categoria];
      var item=null;
      if(sec&&sec.items){
        sec.items.forEach(function(x){if(_s(x.nombre).toLowerCase()===oldNombre.toLowerCase()) item=x;});
      }
      if(item&&_n(item.actual)>0) return{ok:false,error:'No se puede eliminar un item con movimientos. Edita el presupuesto o cambia sus movimientos primero.'};
      sh.deleteRows(drow,1);
    }else{
      return{ok:false,error:'Accion no soportada'};
    }

    return{ok:true,mesData:getMesData(mes)};
  }catch(e){return{ok:false,error:e.toString()};}
}

function _getSaldoBaseMovimientos(mes){
  mes=_normalizarMesNombre(mes);
  var ss=getSS();
  var d=_parseMes(mes);
  if(d&&d.ok) return _n(_saldoSheetConArrastre(ss,mes,d.vistaGeneral||{}));
  return 0;
}

function _compararMovimientoAsc(a,b){
  return _fechaOrdenMovimiento(a)-_fechaOrdenMovimiento(b)||
         (a.orden||0)-(b.orden||0);
}

function _compararMovimientoVista(a,b){
  return _fechaOrdenMovimiento(b)-_fechaOrdenMovimiento(a)||
         (a.orden||0)-(b.orden||0);
}

function _fechaOrdenMovimiento(t){
  if(t.fechaOrden) return t.fechaOrden;
  var n=_fechaMsSimple(t.fecha);
  if(n) return n;
  var ts=String(t.timestamp||'');
  n=new Date(ts.replace(' ','T')).getTime();
  if(!isNaN(n)) return n;
  return parseFloat(String(t.id||'0').replace(/\D/g,''))||0;
}

function actualizarMovimiento(params){
  try{
    var ss=getSS();
    var reg=ss.getSheetByName('Registro');
    if(!reg) return{ok:false,error:'Hoja Registro no encontrada'};
    _asegurarRegistroMesCaja(reg);
    var D=reg.getDataRange().getValues();
    for(var i=1;i<D.length;i++){
      if(String(D[i][0])!==String(params.id)) continue;
      var oldMes=_s(D[i][2]).replace(/^'+/,'');
      var oldMesCaja=_normalizarMesNombre(_s(D[i][9])||_mesDesdeFechaMovimiento(D[i][7])||oldMes);
      var oldSub=_s(D[i][5]);
      var oldMonto=_n(D[i][6]);
      var newMes=_s(params.mes||oldMes);
      newMes=newMes.charAt(0).toUpperCase()+newMes.slice(1);
      var newMesCaja=_normalizarMesNombre(params.mesRegistro||_mesDesdeFechaMovimiento(params.fecha)||newMes);
      var newTipo=_s(params.tipo);
      var newSub=_s(params.subcategoria);
      var newMonto=parseFloat(String(params.monto).replace(',','.'))||0;

      _ajustarImpactoBalanceApp(ss, oldSub, -oldMonto);
      _ajustarImpactoBalanceApp(ss, newSub, newMonto);

      reg.getRange(i+1,3,1,8).setValues([[
        newMes,
        newTipo,
        _s(params.categoria||newTipo),
        newSub,
        newMonto,
        _fechaISOTexto(params.fecha)||'',
        params.notas||'',
        newMesCaja
      ]]);
      reg.getRange(i+1,3).setNumberFormat('@STRING@').setValue(newMes);
      reg.getRange(i+1,8).setNumberFormat('@STRING@').setValue(_fechaISOTexto(params.fecha));
      reg.getRange(i+1,10).setNumberFormat('@STRING@').setValue(newMesCaja);
      _invalidarMovimientoMes(oldMes);
      _invalidarMovimientoMes(newMes);
      _invalidarMovimientoMes(oldMesCaja);
      _invalidarMovimientoMes(newMesCaja);
      SpreadsheetApp.flush();
      return{ok:true,mesData:getMesData(newMesCaja),mesCaja:newMesCaja};
    }
    return{ok:false,error:'Movimiento no encontrado'};
  }catch(e){return{ok:false,error:e.toString()};}
}

function eliminarMovimiento(id){
  try{
    var ss=getSS();
    var reg=ss.getSheetByName('Registro');
    if(!reg) return{ok:false,error:'Hoja Registro no encontrada'};
    var D=reg.getDataRange().getValues();
    for(var i=1;i<D.length;i++){
      if(String(D[i][0])!==String(id)) continue;
      var mes=_s(D[i][2]).replace(/^'+/,'');
      var mesCaja=_mesCajaRegistro(D[i]);
      var sub=_s(D[i][5]);
      var monto=_n(D[i][6]);
      _ajustarImpactoBalanceApp(ss, sub, -monto);
      reg.deleteRow(i+1);
      _invalidarMovimientoMes(mes);
      _invalidarMovimientoMes(mesCaja);
      SpreadsheetApp.flush();
      return{ok:true,mesData:getMesData(mesCaja),mesCaja:mesCaja};
    }
    return{ok:false,error:'Movimiento no encontrado'};
  }catch(e){return{ok:false,error:e.toString()};}
}

function _ajustarImpactoBalanceApp(ss, subcategoria, monto){
  var impactos=BALANCE_MAP[subcategoria];
  if(impactos&&monto) _actualizarBalanceApp(ss, impactos, monto);
}

function _invalidarMovimientoMes(mes){
  if(mes) cDel('mes_'+mes.replace(/ /g,'_'));
  cDel('flujo');
}

function getNotificaciones(){
  try{
    var sh=getSS().getSheetByName('_NOTIF');
    if(!sh) return{ok:true,data:[]};
    var rows=sh.getDataRange().getValues(),r=[];
    for(var i=1;i<rows.length;i++){
      if(rows[i][0]) r.push({id:rows[i][0],texto:rows[i][1],fecha:rows[i][2],leida:rows[i][3]});
    }
    return{ok:true,data:r};
  }catch(e){return{ok:false,error:e.toString()};}
}

function marcarNotifLeida(id){
  try{
    var sh=getSS().getSheetByName('_NOTIF');if(!sh)return{ok:true};
    var rows=sh.getDataRange().getValues();
    for(var i=1;i<rows.length;i++){
      if(String(rows[i][0])===String(id)){sh.getRange(i+1,4).setValue(true);break;}
    }
    return{ok:true};
  }catch(e){return{ok:false,error:e.toString()};}
}

function crearMesNuevo(nombre){
  try{
    var ss=getSS();
    if(ss.getSheetByName(nombre)) return{ok:true,msg:'Ya existe'};
    return _crearMes(ss,nombre);
  }catch(e){return{ok:false,error:e.toString()};}
}

// ── PARSERS ──────────────────────────────────────────────────

function _parseMes(nombre){
  var ss=getSS();
  var sh=ss.getSheetByName(nombre);
  if(!sh) return{ok:false,error:'Hoja no encontrada: '+nombre};
  var D=sh.getDataRange().getValues();
  var esDic25=(nombre==='Diciembre 25');
  return{
    ok:true,mes:nombre,
    vistaGeneral:_parseVG(D),
    necesidades:_parseNec(D),
    deseos:_parseDes(D),
    deudas:_parseDeu(D,esDic25),
    ahorros:_parseAho(D),
    ingresos:_parseIng(D),
    metricas:_parseMetricas(D)
  };
}

function _enriquecerConRegistros(d,mes){
  try{
    mes=_normalizarMesNombre(mes);
    var ss=getSS();
    var reg=ss.getSheetByName('Registro');
    if(!reg) return d;
    _asegurarRegistroMesCaja(reg);
    var D=reg.getDataRange().getValues();
    if(D.length<=1) return d;

    var totalEgrApp=0,totalIngApp=0,sumasPorSub={};
    for(var i=1;i<D.length;i++){
      var mesFila=_normalizarMesNombre(_s(D[i][2]).replace(/^'+/,''));
      var tipo=_s(D[i][3]),sub=_s(D[i][5]),monto=_n(D[i][6]);
      var mesCaja=_normalizarMesNombre(_mesCajaRegistro(D[i]));
      if(mesCaja===mes){
        if(tipo==='ingreso') totalIngApp+=monto;
        else totalEgrApp+=monto;
      }
      if(mesFila!==mes) continue;
      sumasPorSub[sub]=(sumasPorSub[sub]||0)+monto;
    }
    var vg0=d.vistaGeneral||{};
    var saldoSheet=vg0.saldoFinal?vg0.saldoFinal.actual:0;
    var saldoBase=_saldoSheetConArrastre(ss,mes,vg0);
    var saldoNecesitaArrastre=Math.abs(_n(saldoBase)-_n(saldoSheet))>0.004;
    if(Object.keys(sumasPorSub).length===0&&totalIngApp===0&&totalEgrApp===0&&!saldoNecesitaArrastre) return d;

    // Clonar para no mutar el objeto cacheado
    var dc=JSON.parse(JSON.stringify(d));

    function actSec(sec){
      if(!sec||!sec.items) return sec;
      sec.items=sec.items.map(function(it){
        var ex=sumasPorSub[it.nombre]||0;
        if(ex===0) return it;
        it.actual=(it.actual||0)+ex;
        it.sobrante=(it.presupuesto||it.prestamo||0)-it.actual;
        it.status=_st(it.presupuesto||it.prestamo||0,it.actual);
        return it;
      });
      sec.total=sec.items.reduce(function(a,x){return a+(x.actual||0);},0);
      return sec;
    }

    dc.necesidades=actSec(dc.necesidades);
    dc.deseos=actSec(dc.deseos);
    dc.deudas=actSec(dc.deudas);
    dc.ahorros=actSec(dc.ahorros);

    if(dc.ingresos&&dc.ingresos.items){
      dc.ingresos.items=dc.ingresos.items.map(function(it){
        var ex=sumasPorSub[it.nombre]||0;
        if(ex===0) return it;
        it.actual=(it.actual||0)+ex;
        return it;
      });
      dc.ingresos.totalActual=dc.ingresos.items.reduce(function(a,x){return a+(x.actual||0);},0);
    }

    var vg=dc.vistaGeneral||{};
    dc.vistaGeneral.saldoFinal={
      presupuesto:vg.saldoFinal?vg.saldoFinal.presupuesto:0,
      actual:saldoBase+(totalIngApp-totalEgrApp)
    };

    dc.metricas=_recalcularMetricas(dc);
    return dc;
  }catch(e){Logger.log('Error enricher: '+e);return d;}
}

function _parseVG(D){
  var vg={},siCount=0;
  for(var i=0;i<Math.min(D.length,20);i++){
    var lb=_s(D[i][1]),pr=_n(D[i][2]),ac=_n(D[i][3]);
    if(lb==='Saldo Inicial'){siCount++;if(siCount===2)vg.saldoInicial={presupuesto:pr,actual:ac};}
    if(lb==='Ingresos'&&i>9)             vg.ingresos={presupuesto:pr,actual:ac};
    if(lb==='Necesidades y Deudas')      vg.necesidadesDeudas={presupuesto:pr,actual:ac};
    if(lb==='Necesidades'&&!vg.necesidades) vg.necesidades={presupuesto:pr,actual:ac};
    if(lb==='Deseos')                    vg.deseos={presupuesto:pr,actual:ac};
    if(lb==='Deudas')                    vg.deudas={presupuesto:pr,actual:ac};
    if(lb==='Ahorros'&&i>10&&i<18)       vg.ahorros={presupuesto:pr,actual:ac};
    if(lb==='Saldo Final')               vg.saldoFinal={presupuesto:pr,actual:ac};
  }
  return vg;
}

function _parseNec(D){
  var items=[],inH=false;
  for(var i=0;i<D.length;i++){
    var f=_s(D[i][5]),g=_s(D[i][6]);
    if(g==='Presupuesto'&&_s(D[i][7])==='Actual'){inH=true;continue;}
    if(!inH) continue;
    if(f==='Total'||f==='') break;
    if(f) items.push({nombre:f,presupuesto:_n(D[i][6]),actual:_n(D[i][7]),sobrante:_n(D[i][8]),status:_st(_n(D[i][6]),_n(D[i][7]))});
  }
  return{items:items,total:items.reduce(function(a,x){return a+x.actual;},0),
         totalPresupuesto:items.reduce(function(a,x){return a+x.presupuesto;},0)};
}

function _parseDes(D){
  var items=[],inH=false;
  for(var i=0;i<D.length;i++){
    var k=_s(D[i][10]),l=_s(D[i][11]);
    if(l==='Presupuesto'&&_s(D[i][12])==='Actual'){inH=true;continue;}
    if(!inH) continue;
    if(k==='Total'||k==='') break;
    if(k) items.push({nombre:k,presupuesto:_n(D[i][11]),actual:_n(D[i][12]),sobrante:_n(D[i][13]),status:_st(_n(D[i][11]),_n(D[i][12]))});
  }
  return{items:items,total:items.reduce(function(a,x){return a+x.actual;},0),
         totalPresupuesto:items.reduce(function(a,x){return a+x.presupuesto;},0)};
}

function _parseDeu(D,esDic25){
  var items=[],inH=false;
  for(var i=0;i<D.length;i++){
    var p=_s(D[i][15]),q=_s(D[i][16]);
    if((q==='Prestamo'||q==='Vence')&&(_s(D[i][17])==='Actual'||_s(D[i][17])==='Prestamo')){inH=true;continue;}
    if(!inH) continue;
    if(p==='Total'||p==='') break;
    if(p){
      var prestamo,actual,vence=null;
      if(esDic25){vence=D[i][16];prestamo=_n(D[i][17]);actual=_n(D[i][18]);}
      else{prestamo=_n(D[i][16]);actual=_n(D[i][17]);}
      items.push({nombre:p,vence:vence,prestamo:prestamo,actual:actual,status:actual>0?'ok':'empty'});
    }
  }
  return{items:items,total:items.reduce(function(a,x){return a+x.actual;},0),
         totalPresupuesto:items.reduce(function(a,x){return a+x.prestamo;},0)};
}

function _parseAho(D){
  var items=[],inH=false,presTotal=0,actTotal=0;
  for(var i=0;i<D.length;i++){
    var lb=_s(D[i][1]);
    if(lb==='Ahorros'&&i>10&&i<18){presTotal=_n(D[i][2]);actTotal=_n(D[i][3]);}
    if(lb==='Ahorros'&&i>=26){inH=true;continue;}
    if(!inH||i<27) continue;
    if(_s(D[i][2])==='Presupuesto') continue;
    if(lb==='Total') break;
    if(lb===''&&_n(D[i][2])===0&&_n(D[i][3])===0) continue;
    if(lb) items.push({nombre:lb,presupuesto:_n(D[i][2]),actual:_n(D[i][3])});
  }
  return{items:items,total:actTotal,totalPresupuesto:presTotal,
         totalCalculado:items.reduce(function(a,x){return a+x.actual;},0)};
}

function _parseIng(D){
  var items=[],inH=false;
  for(var i=0;i<D.length;i++){
    var lb=_s(D[i][1]);
    if(lb==='Ingresos'&&i>15){inH=true;continue;}
    if(!inH)continue;
    if(_s(D[i][1])==='Presupuesto'||_s(D[i][2])==='Presupuesto')continue;
    if(lb===''&&i>25)break;
    if(lb&&lb!=='Total'&&_n(D[i][2])>=0)
      items.push({nombre:lb,presupuesto:_n(D[i][2]),actual:_n(D[i][3])});
    if(lb===''&&_n(D[i][2])>0)break;
  }
  return{items:items,
    totalPresupuesto:items.reduce(function(a,x){return a+x.presupuesto;},0),
    totalActual:items.reduce(function(a,x){return a+x.actual;},0)};
}

function _parseMetricas(D){
  var m={};
  if(D[5])  m.ingresos ={pctEst:_n(D[5][19]) ,valEst:_n(D[5][20]) ,pctReal:_n(D[5][21]) ,valReal:_n(D[5][22])};
  if(D[6])  m.necDeudas={pctEst:_n(D[6][19]) ,valEst:_n(D[6][20]) ,pctReal:_n(D[6][21]) ,valReal:_n(D[6][22])};
  if(D[7])  m.deseos   ={pctEst:_n(D[7][19]) ,valEst:_n(D[7][20]) ,pctReal:_n(D[7][21]) ,valReal:_n(D[7][22])};
  if(D[8])  m.ahorros  ={pctEst:_n(D[8][19]) ,valEst:_n(D[8][20]) ,pctReal:_n(D[8][21]) ,valReal:_n(D[8][22])};
  if(D[10]) m.totales  ={pctEst:_n(D[10][19]),valEst:_n(D[10][20]),pctReal:_n(D[10][21]),valReal:_n(D[10][22])};
  return m;
}

function _recalcularMetricas(d){
  var ing=d.ingresos?d.ingresos.totalActual:0;
  if(ing===0) return d.metricas||{};
  var necT=d.necesidades?d.necesidades.total:0;
  var desT=d.deseos?d.deseos.total:0;
  var deuT=d.deudas?d.deudas.total:0;
  var ahoT=d.ahorros?(d.ahorros.total||d.ahorros.totalCalculado||0):0;
  var m=JSON.parse(JSON.stringify(d.metricas||{}));
  if(m.necDeudas){m.necDeudas.valReal=necT+deuT;m.necDeudas.pctReal=(necT+deuT)/ing;}
  if(m.deseos)   {m.deseos.valReal=desT;m.deseos.pctReal=desT/ing;}
  if(m.ahorros)  {m.ahorros.valReal=ahoT;m.ahorros.pctReal=ahoT/ing;}
  return m;
}

function _parseBalance(){
  var ss=getSS();
  var sh=ss.getSheetByName('Balance General');
  if(!sh) return{ok:false,error:'Hoja Balance General no encontrada'};
  var D=sh.getDataRange().getValues();
  var activos=[],pasivos=[];
  var totalActivos=0,totalPasivos=0,patrimonioNeto=0;

  for(var i=0;i<D.length;i++){
    var cod=_s(D[i][0]),cta=_s(D[i][1]),val=_n(D[i][2]);
    var codP=_s(D[i][5]),ctaP=_s(D[i][6]),valP=_n(D[i][7]);

    if(cod&&cod.charAt(0)==='1'&&cta&&cta!=='Cuenta'){
      activos.push({codigo:cod,nombre:cta,valor:val,
                    esGrupo:cod.indexOf('.')===-1&&cod.toUpperCase().indexOf('TOTAL')===-1});
    }
    if(cod==='TOTAL DE ACTIVOS') totalActivos=_n(D[i][3]);

    if(codP&&codP.charAt(0)==='2'&&ctaP&&ctaP!=='Código'){
      pasivos.push({codigo:codP,nombre:ctaP,valor:valP,esGrupo:codP.indexOf('.')===-1});
    }
    if(!codP&&ctaP==='Brackets'&&valP>0){
      pasivos.push({codigo:'brackets',nombre:'Brackets',valor:valP,esGrupo:false});
    }
    if(codP==='TOTAL DE PASIVOS') totalPasivos=_n(D[i][8]);
    if(codP==='PATRIMONIO NETO')  patrimonioNeto=valP;
  }
  return{ok:true,activos:activos,totalActivos:totalActivos,
         pasivos:pasivos,totalPasivos:totalPasivos,patrimonioNeto:patrimonioNeto};
}

function _parseFlujoCaja(){
  var ss=getSS();
  var sh=ss.getSheetByName('Flujo de Caja');
  if(!sh) return{ok:false,error:'Flujo de Caja no encontrada'};
  var D=sh.getDataRange().getValues();
  var meses=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var filas=[];
  var catMap={'SALDO INICIAL':1,'TOTAL INGRESOS':1,'TOTAL EGRESOS':1,'FLUJO OPERATIVO':1,'FLUJO DE CAJA ACUMULADO':1};
  var subMap={'SUELDO':1,'PINTURAS':1,'OTROS INGRESOS':1,'NECESIDADES':1,'DESEOS':1,'DEUDAS':1,'AHORROS':1};

  for(var i=0;i<D.length;i++){
    var cat=_s(D[i][2]).toUpperCase(),sub=_s(D[i][3]).toUpperCase();
    var key=catMap[cat]?cat:(subMap[sub]?sub:null);
    if(!key) continue;
    var vals=[],total=_n(D[i][17]);
    for(var j=4;j<16;j++) vals.push(_n(D[i][j]));
    filas.push({label:key,valores:vals,total:total});
  }

  var reg=ss.getSheetByName('Registro');
  if(reg){
    var DR=reg.getDataRange().getValues();
    var deltas={};
    for(var r=1;r<DR.length;r++){
      var mesFila=_normalizarMesNombre(_s(DR[r][2]).replace(/^'+/,''));
      var mesCorto=mesFila.split(' ')[0].slice(0,3);
      var idxMes=meses.indexOf(mesCorto);
      if(idxMes<0) continue;
      var tipo=_s(DR[r][3]),sub=_s(DR[r][5]),monto=_n(DR[r][6]);
      if(!deltas[idxMes]) deltas[idxMes]={ing:0,egr:0,sueldo:0,pinturasIng:0,otrosIng:0,nec:0,des:0,deu:0,aho:0};
      if(tipo==='ingreso'){
        deltas[idxMes].ing+=monto;
        if(sub==='Sueldo') deltas[idxMes].sueldo+=monto;
        else if(sub==='Pinturas') deltas[idxMes].pinturasIng+=monto;
        else deltas[idxMes].otrosIng+=monto;
      }else{
        deltas[idxMes].egr+=monto;
        if(tipo==='necesidad') deltas[idxMes].nec+=monto;
        else if(tipo==='deseo') deltas[idxMes].des+=monto;
        else if(tipo==='deuda') deltas[idxMes].deu+=monto;
        else if(tipo==='ahorro') deltas[idxMes].aho+=monto;
      }
    }
    filas.forEach(function(f){
      for(var idx in deltas){
        var d=deltas[idx];
        if(f.label==='SUELDO')                  f.valores[idx]=(f.valores[idx]||0)+d.sueldo;
        if(f.label==='PINTURAS')                f.valores[idx]=(f.valores[idx]||0)+d.pinturasIng;
        if(f.label==='OTROS INGRESOS')          f.valores[idx]=(f.valores[idx]||0)+d.otrosIng;
        if(f.label==='NECESIDADES')             f.valores[idx]=(f.valores[idx]||0)+d.nec;
        if(f.label==='DESEOS')                  f.valores[idx]=(f.valores[idx]||0)+d.des;
        if(f.label==='DEUDAS')                  f.valores[idx]=(f.valores[idx]||0)+d.deu;
        if(f.label==='AHORROS')                 f.valores[idx]=(f.valores[idx]||0)+d.aho;
      }
      f.total=f.valores.reduce(function(a,v){return a+v;},0);
    });
  }

  _recalcularFlujoCajaMensual(filas, meses);

  return{ok:true,data:{meses:meses,filas:filas}};
}

function _filaFlujo(filas,label){
  for(var i=0;i<filas.length;i++) if(filas[i].label===label) return filas[i];
  var f={label:label,valores:[0,0,0,0,0,0,0,0,0,0,0,0],total:0};
  filas.push(f);
  return f;
}

function _recalcularFlujoCajaMensual(filas, meses){
  var si=_filaFlujo(filas,'SALDO INICIAL');
  var ing=_filaFlujo(filas,'TOTAL INGRESOS');
  var egr=_filaFlujo(filas,'TOTAL EGRESOS');
  var op=_filaFlujo(filas,'FLUJO OPERATIVO');
  var ac=_filaFlujo(filas,'FLUJO DE CAJA ACUMULADO');
  var sueldo=_filaFlujo(filas,'SUELDO'),pinturas=_filaFlujo(filas,'PINTURAS'),otros=_filaFlujo(filas,'OTROS INGRESOS');
  var nec=_filaFlujo(filas,'NECESIDADES'),des=_filaFlujo(filas,'DESEOS'),deu=_filaFlujo(filas,'DEUDAS'),aho=_filaFlujo(filas,'AHORROS');
  var saldoInicial=_n(si.valores[0]);
  for(var i=0;i<meses.length;i++){
    if(i>0) si.valores[i]=_money(ac.valores[i-1]);
    ing.valores[i]=_money((sueldo.valores[i]||0)+(pinturas.valores[i]||0)+(otros.valores[i]||0));
    egr.valores[i]=_money((nec.valores[i]||0)+(des.valores[i]||0)+(deu.valores[i]||0)+(aho.valores[i]||0));
    op.valores[i]=_money((ing.valores[i]||0)-(egr.valores[i]||0));
    ac.valores[i]=_money((i===0?saldoInicial:si.valores[i]||0)+(op.valores[i]||0));
  }
  filas.forEach(function(f){
    f.valores=f.valores.map(_money);
    f.total=(f.label==='FLUJO DE CAJA ACUMULADO'||f.label==='SALDO INICIAL')
      ?f.valores[f.valores.length-1]
      :f.valores.reduce(function(a,v){return a+(v||0);},0);
    f.total=_money(f.total);
  });
}

function _money(v){
  var n=Math.round((_n(v)+Number.EPSILON)*100)/100;
  return Math.abs(n)<0.005?0:n;
}

function _parseJapon(){
  var ss=getSS();
  var sh=ss.getSheetByName('Viaje a Japón');
  if(!sh) return{ok:false,error:'Hoja no encontrada'};
  var D=sh.getDataRange().getValues();
  var items=[],tramites=[],tramNom=['Formulario DS-160','Integrity Fee','Visa Japonesa'];
  var totalActualReal=0,totalPres=0;
  for(var i=0;i<D.length;i++){
    var colB=_s(D[i][1]),colG=_s(D[i][6]);
    if(colB&&colB!=='Viaje a Japón'&&colB!=='Total'&&colB!=='Presupuesto Real'&&_n(D[i][2])>0)
      items.push({nombre:colB,presupuesto:_n(D[i][2]),actual:_n(D[i][3]),faltante:_n(D[i][4])});
    if(colB==='Total'&&_n(D[i][2])>0) totalPres=_n(D[i][2]);
    if(tramNom.indexOf(colG)!==-1)
      tramites.push({nombre:colG,presupuesto:_n(D[i][7]),actual:_n(D[i][8]),
                     faltante:_n(D[i][9]),pagado:_n(D[i][8])>=_n(D[i][7])&&_n(D[i][7])>0});
    if(colG==='Viaje a Japón') totalActualReal=_n(D[i][8]);
  }
  if(!totalPres) totalPres=4177;
  return{ok:true,items:items,tramites:tramites,totalPresupuesto:totalPres,
         totalActual:totalActualReal,faltante:totalPres-totalActualReal,
         porcentaje:totalPres>0?(totalActualReal/totalPres)*100:0};
}

// ── ESCRITURA ────────────────────────────────────────────────

function _crearMes(ss,nombre){
  var sheets=ss.getSheets(),base=null,saldoFinal=0;
  for(var i=sheets.length-1;i>=0;i--){
    var nm=sheets[i].getName();
    if(ESPECIALES.indexOf(nm)===-1){
      var p=nm.split(' ');
      if(p.length===2&&MESES_NOM.some(function(m){return nm.indexOf(m)===0;})){
        base=sheets[i];
        var D=base.getDataRange().getValues();
        for(var j=0;j<D.length;j++){
          if(_s(D[j][1])==='Saldo Final'){saldoFinal=_n(D[j][3]);break;}
        }
        break;
      }
    }
  }
  if(!base) return{ok:false,error:'No hay hoja base'};
  saldoFinal=_saldoFinalRealParaCrearMes(base.getName(),saldoFinal);
  var nueva=base.copyTo(ss);
  nueva.setName(nombre);
  var D2=nueva.getDataRange().getValues();
  for(var i=0;i<D2.length;i++){
    var lb=_s(D2[i][1]);
    if(['Ingresos','Necesidades y Deudas','Necesidades','Deseos','Deudas','Ahorros','Saldo Final','Gasto'].indexOf(lb)!==-1&&i>5&&i<20)
      nueva.getRange(i+1,4).setValue(0);
    if(lb==='Saldo Inicial'&&i>5&&i<20){nueva.getRange(i+1,3).setValue(saldoFinal);nueva.getRange(i+1,4).setValue(saldoFinal);}
    if(i>3&&i<26){
      if(_s(D2[i][5])&&_n(D2[i][6])>0) nueva.getRange(i+1,8).setValue(0);
      if(_s(D2[i][10])&&_n(D2[i][11])>0) nueva.getRange(i+1,13).setValue(0);
      if(_s(D2[i][15])) nueva.getRange(i+1,18).setValue(0);
    }
    if(i===0) nueva.getRange(1,2).setValue(nombre.split(' ')[0].toUpperCase());
  }
  for(var k=19;k<26&&k<D2.length;k++){if(_s(D2[k][1])) nueva.getRange(k+1,4).setValue(0);}
  return{ok:true,msg:'Mes creado: '+nombre};
}

function _saldoFinalRealParaCrearMes(nombreBase,fallback){
  try{
    var d=_parseMes(nombreBase);
    if(d&&d.ok){
      var e=_enriquecerConRegistros(d,nombreBase);
      if(e&&e.vistaGeneral&&e.vistaGeneral.saldoFinal){
        return _n(e.vistaGeneral.saldoFinal.actual);
      }
    }
  }catch(err){Logger.log('saldo real crear mes: '+err);}
  return _n(fallback);
}

function _pinturasSheet(ss){
  var sh=ss.getSheetByName('PINTURAS');
  if(!sh){
    sh=ss.insertSheet('PINTURAS');
    sh.appendRow(['Mes','Stock inicial','Stock agregado','Stock actual','Autoconsumo','Con descuento','Actualizado']);
    sh.setFrozenRows(1);
  }else if(sh.getLastRow()<1){
    sh.appendRow(['Mes','Stock inicial','Stock agregado','Stock actual','Autoconsumo','Con descuento','Actualizado']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function _calcPinturas(r){
  var inicial=Math.max(0,_n(r.stockInicial));
  var agregado=Math.max(0,_n(r.stockAgregado));
  var actual=Math.max(0,_n(r.stockActual));
  var autoconsumo=Math.max(0,_n(r.autoconsumo));
  var descuento=Math.max(0,_n(r.descuento));
  var vendidas=Math.max(0,inicial+agregado-actual);
  var ingresos=_money((6.5*vendidas)-(2*autoconsumo)-(0.5*descuento));
  var costo=_money(4.5*vendidas);
  var utilidad=_money(ingresos-costo);
  return {
    stockInicial:inicial,
    stockAgregado:agregado,
    stockActual:actual,
    autoconsumo:autoconsumo,
    descuento:descuento,
    vendidas:_money(vendidas),
    ingresos:ingresos,
    costo:costo,
    utilidad:utilidad
  };
}

function getPinturasMes(mes){
  try{
    mes=_s(mes)||_getMesActual();
    var ss=getSS(),sh=_pinturasSheet(ss),D=sh.getDataRange().getValues();
    var raw={stockInicial:0,stockAgregado:0,stockActual:0,autoconsumo:0,descuento:0};
    for(var i=1;i<D.length;i++){
      if(_s(D[i][0])===mes){
        raw={stockInicial:D[i][1],stockAgregado:D[i][2],stockActual:D[i][3],autoconsumo:D[i][4],descuento:D[i][5]};
        break;
      }
    }
    var calc=_calcPinturas(raw);
    calc.mes=mes;
    return {ok:true,data:calc};
  }catch(e){
    return {ok:false,error:e.toString()};
  }
}

function guardarPinturasMes(params){
  try{
    params=params||{};
    var mes=_s(params.mes)||_getMesActual();
    var raw={
      stockInicial:_n(params.stockInicial),
      stockAgregado:_n(params.stockAgregado),
      stockActual:_n(params.stockActual),
      autoconsumo:_n(params.autoconsumo),
      descuento:_n(params.descuento)
    };
    var calc=_calcPinturas(raw);
    if(calc.autoconsumo+calc.descuento>calc.vendidas){
      return {ok:false,error:'Autoconsumo y descuento no pueden superar las pinturas vendidas.'};
    }
    var ss=getSS(),sh=_pinturasSheet(ss),D=sh.getDataRange().getValues(),row=0;
    for(var i=1;i<D.length;i++){if(_s(D[i][0])===mes){row=i+1;break;}}
    var values=[mes,calc.stockInicial,calc.stockAgregado,calc.stockActual,calc.autoconsumo,calc.descuento,_nowLocal()];
    if(row) sh.getRange(row,1,1,values.length).setValues([values]);
    else sh.appendRow(values);
    calc.mes=mes;
    cDel('mes_'+mes);
    return {ok:true,data:calc};
  }catch(e){
    return {ok:false,error:e.toString()};
  }
}

function exportarSnapshotSupabase(opts){
  try{
    opts=opts||{};
    var mesesRes=getMesesDisponibles();
    if(!mesesRes||!mesesRes.ok) return mesesRes||{ok:false,error:'No se pudieron leer los meses'};
    var meses=mesesRes.data||[];
    if(opts.meses&&opts.meses.length){
      var filtro={};
      opts.meses.forEach(function(m){filtro[_normalizarMesNombre(m)]=true;});
      meses=meses.filter(function(m){return filtro[_normalizarMesNombre(m)];});
    }
    var cards=['VISA','MC'];
    var out={
      exportedAt:new Date().toISOString(),
      source:'apps_script_sheets',
      mesesDisponibles:mesesRes.data||[],
      meses:[],
      balance:getBalanceGeneral(),
      flujo:getFlujoCaja(),
      japon:getViajeJapon()
    };
    meses.forEach(function(m){
      var yy=parseInt(String(m).split(' ')[1],10);
      var anio=isNaN(yy)?(new Date()).getFullYear():2000+yy;
      var tdcStates=[];
      cards.forEach(function(card,idx){
        tdcStates.push({
          tarjeta:card,
          state:getTarjetasState({mes:m,idx:idx,anio:anio}),
          movimientos:getMovimientosTarjeta(m,card)
        });
      });
      out.meses.push({
        mes:m,
        anio:anio,
        mesData:getMesData(m),
        movimientos:getMovimientosMes(m),
        tarjetas:tdcStates,
        pinturas:getPinturasMes(m)
      });
    });
    return{ok:true,data:out};
  }catch(e){
    return{ok:false,error:e.toString()};
  }
}

// ============================================================
// API para Vercel - agrega este bloque al final de Code.gs
// ============================================================
function _getApiToken(){
  var token = PropertiesService.getScriptProperties().getProperty('FINPER_API_TOKEN');
  if(!token){
    throw new Error('Falta configurar FINPER_API_TOKEN en Propiedades del script.');
  }
  return token;
}

var API_METHODS = {
  getMesesDisponibles: getMesesDisponibles,
  getMesData: getMesData,
  getBalanceGeneral: getBalanceGeneral,
  actualizarBalance: actualizarBalance,
  eliminarBalanceItem: eliminarBalanceItem,
  getFlujoCaja: getFlujoCaja,
  getViajeJapon: getViajeJapon,
  actualizarJapon: actualizarJapon,
  getPinturasMes: getPinturasMes,
  guardarPinturasMes: guardarPinturasMes,
  exportarSnapshotSupabase: exportarSnapshotSupabase,
  parseTarjetas: parseTarjetas,
  getTarjetasState: getTarjetasState,
  registrarMovimientoTarjeta: registrarMovimientoTarjeta,
  getMovimientosTarjeta: getMovimientosTarjeta,
  actualizarMovimientoTarjeta: actualizarMovimientoTarjeta,
  eliminarMovimientoTarjeta: eliminarMovimientoTarjeta,
  registrarMovimiento: registrarMovimiento,
  getDesgloseSub: getDesgloseSub,
  gestionarItemCategoria: gestionarItemCategoria,
  getMovimientosMes: getMovimientosMes,
  actualizarMovimiento: actualizarMovimiento,
  eliminarMovimiento: eliminarMovimiento,
  getNotificaciones: getNotificaciones,
  marcarNotifLeida: marcarNotifLeida,
  crearMesNuevo: crearMesNuevo
};

function doPost(e){
  try{
    var payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var expected = _getApiToken();
    if(expected && payload.token !== expected){
      return _apiJson({ok:false,error:'No autorizado'});
    }
    var fn = payload.fn;
    var args = payload.args || [];
    if(!API_METHODS[fn]){
      return _apiJson({ok:false,error:'Metodo no permitido: '+fn});
    }
    return _apiJson(API_METHODS[fn].apply(null,args));
  }catch(err){
    return _apiJson({ok:false,error:String(err)});
  }
}

function _apiJson(obj){
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
