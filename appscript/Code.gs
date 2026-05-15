// ============================================================
// Code.gs — Finanzas Personales v8
// ============================================================
var SS_ID   = '1S-Y1kozPzLPKt6iau3Tpe4TKhF7GcczlT8VUZyZTtdU';
var CACHE_S = 300;

var MESES_NOM = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

var ESPECIALES = ['Balance General','Flujo TDC Papi','Flujo de Caja',
                  'Viaje a Japón','Registro','TDC_VISA','TDC_MC','_NOTIF',
                  'Balance_App'];

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
function _st(p,a){
  if(!a||!p) return 'empty';
  var r=a/p; if(r<=0.85) return 'ok'; if(r<=1) return 'warn'; return 'over';
}

function doGet(){
  return HtmlService
    .createHtmlOutputFromFile('index')
    .setTitle('Finanzas Personales')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport','width=device-width,initial-scale=1.0,viewport-fit=cover');
}

// ── HELPERS INTERNOS ────────────────────────────────────────

function _getMesActual(){
  var ss=getSS();
  var hoy=new Date();
  var nombre=MESES_NOM[hoy.getMonth()]+' '+String(hoy.getFullYear()).slice(-2);
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

// ── API PÚBLICA ──────────────────────────────────────────────

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
    var ck='mes_'+nombre.replace(/ /g,'_');
    var c=cGet(ck);if(c) return _enriquecerConRegistros(c,nombre);
    var d=_parseMes(nombre);
    if(!d||!d.ok) return d;
    cPut(ck,d);
    return _enriquecerConRegistros(d,nombre);
  }catch(e){return{ok:false,error:e.toString()};}
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

function actualizarBalance(params){
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

function getFlujoCaja(){
  try{
    var c=cGet('flujo');if(c) return c;
    var d=_parseFlujoCaja();if(d&&d.ok) cPut('flujo',d);
    return d;
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

    return{ok:true,tarjetas:[
      {id:'VISA',nombre:'Visa Personal',numero:'**** **** **** 4894',
       clase:'visa-card',logo:'visa',
       historial2026:bloquePersonal,meses2026:meses2026,
       historial2025:[],meses2025:[]},
      {id:'MC',nombre:'Mastercard Gold GC',numero:'**** **** **** 9593',
       clase:'mc-card',logo:'mc',
       historial2026:bloqueGC,meses2026:meses2026,
       historial2025:papi2025,meses2025:meses2025}
    ]};
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

    // 1. Escribir en hoja Registro
    var reg=ss.getSheetByName('Registro');
    if(!reg){
      reg=ss.insertSheet('Registro');
      reg.appendRow(['ID','Timestamp','Mes','Tipo','Categoria','Subcategoria','Monto','Fecha','Notas']);
      reg.setFrozenRows(1);
    }
    var id=new Date().getTime().toString();
    reg.appendRow([
      id, new Date().toISOString(), mes, params.tipo, params.categoria,
      params.subcategoria,
      parseFloat(String(params.monto).replace(',','.'))||0,
      params.fecha, params.notas||''
    ]);
    var ultimaFila=reg.getLastRow();
    reg.getRange(ultimaFila,3).setNumberFormat('@STRING@').setValue(mes);

    // 2. Actualizar Balance_App si el ítem tiene impacto en balance
    var monto=parseFloat(String(params.monto).replace(',','.'))||0;
    var impactos=BALANCE_MAP[params.subcategoria];
    if(impactos){
      _actualizarBalanceApp(ss, impactos, monto);
    }

    // 3. Invalidar caché
    cDel('mes_'+mes.replace(/ /g,'_'));
    cDel('flujo');

    // 4. Notificar excesos
    _checkExceso(ss, params);

    return{ok:true};
  }catch(e){return{ok:false,error:e.toString()};}
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
        result.push({fecha:_s(D[i][7]),monto:_n(D[i][6]),notas:_s(D[i][8])});
    }
    return{ok:true,data:result};
  }catch(e){return{ok:false,error:e.toString()};}
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
    var ss=getSS();
    var reg=ss.getSheetByName('Registro');
    if(!reg) return d;
    var D=reg.getDataRange().getValues();
    if(D.length<=1) return d;

    var totalEgrApp=0,totalIngApp=0,sumasPorSub={};
    for(var i=1;i<D.length;i++){
      var mesFila=_s(D[i][2]).replace(/^'+/,'');
      if(mesFila!==mes) continue;
      var tipo=_s(D[i][3]),sub=_s(D[i][5]),monto=_n(D[i][6]);
      sumasPorSub[sub]=(sumasPorSub[sub]||0)+monto;
      if(tipo==='ingreso') totalIngApp+=monto;
      else totalEgrApp+=monto;
    }
    if(Object.keys(sumasPorSub).length===0) return d;

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
    var saldoSheet=vg.saldoFinal?vg.saldoFinal.actual:0;
    dc.vistaGeneral.saldoFinal={
      presupuesto:vg.saldoFinal?vg.saldoFinal.presupuesto:0,
      actual:saldoSheet+(totalIngApp-totalEgrApp)
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

  // Enriquecer mes actual con registros de la app
  var mesActual=_getMesActual();
  if(mesActual){
    var reg=ss.getSheetByName('Registro');
    if(reg){
      var DR=reg.getDataRange().getValues();
      var mesCorto=mesActual.split(' ')[0].slice(0,3);
      var idxMes=meses.indexOf(mesCorto);
      if(idxMes>=0){
        var deltaIng=0,deltaEgr=0,deltaNec=0,deltaDes=0,deltaDeu=0,deltaAho=0;
        for(var r=1;r<DR.length;r++){
          var mesFila=_s(DR[r][2]).replace(/^'+/,'');
          if(mesFila!==mesActual) continue;
          var tipo=_s(DR[r][3]),monto=_n(DR[r][6]);
          if(tipo==='ingreso')        deltaIng+=monto;
          else if(tipo==='necesidad') deltaNec+=monto;
          else if(tipo==='deseo')     deltaDes+=monto;
          else if(tipo==='deuda')     deltaDeu+=monto;
          else if(tipo==='ahorro')    deltaAho+=monto;
          if(tipo!=='ingreso') deltaEgr+=monto;
        }
        var flujoOp=deltaIng-deltaEgr;
        filas.forEach(function(f){
          if(f.label==='TOTAL INGRESOS')         f.valores[idxMes]=(f.valores[idxMes]||0)+deltaIng;
          if(f.label==='TOTAL EGRESOS')          f.valores[idxMes]=(f.valores[idxMes]||0)+deltaEgr;
          if(f.label==='NECESIDADES')            f.valores[idxMes]=(f.valores[idxMes]||0)+deltaNec;
          if(f.label==='DESEOS')                 f.valores[idxMes]=(f.valores[idxMes]||0)+deltaDes;
          if(f.label==='DEUDAS')                 f.valores[idxMes]=(f.valores[idxMes]||0)+deltaDeu;
          if(f.label==='AHORROS')                f.valores[idxMes]=(f.valores[idxMes]||0)+deltaAho;
          if(f.label==='FLUJO OPERATIVO')        f.valores[idxMes]=(f.valores[idxMes]||0)+flujoOp;
          if(f.label==='FLUJO DE CAJA ACUMULADO')f.valores[idxMes]=(f.valores[idxMes]||0)+flujoOp;
        });

        // Propagar saldo acumulado correcto a meses futuros
        var acFila=null,siFila=null;
        filas.forEach(function(f){
          if(f.label==='FLUJO DE CAJA ACUMULADO') acFila=f;
          if(f.label==='SALDO INICIAL') siFila=f;
        });
        if(acFila&&siFila){
          var saldoCorrectoMesActual=acFila.valores[idxMes];
          for(var m2=idxMes+1;m2<12;m2++){
            siFila.valores[m2]=saldoCorrectoMesActual;
            acFila.valores[m2]=saldoCorrectoMesActual;
          }
        }

        // Recalcular totales
        filas.forEach(function(f){
          f.total=f.valores.reduce(function(a,v){return a+v;},0);
        });
      }
    }
  }

  return{ok:true,data:{meses:meses,filas:filas}};
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
// ============================================================
// API para Vercel - agrega este bloque al final de Code.gs
// ============================================================
var API_TOKEN_FALLBACK = 'CAMBIA_ESTE_TOKEN_LARGO_Y_PRIVADO';

function _getApiToken(){
  return PropertiesService.getScriptProperties().getProperty('FINPER_API_TOKEN') || API_TOKEN_FALLBACK;
}

var API_METHODS = {
  getMesesDisponibles: getMesesDisponibles,
  getMesData: getMesData,
  getBalanceGeneral: getBalanceGeneral,
  actualizarBalance: actualizarBalance,
  getFlujoCaja: getFlujoCaja,
  getViajeJapon: getViajeJapon,
  actualizarJapon: actualizarJapon,
  parseTarjetas: parseTarjetas,
  registrarMovimiento: registrarMovimiento,
  getDesgloseSub: getDesgloseSub,
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
