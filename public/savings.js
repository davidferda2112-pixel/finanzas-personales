/* Funding UI uses the existing movement, balance-history and transaction modals. */
function setBalanceCreateKind(kind){
  G.balCreateKind=kind;
  ['bal-item-group-row','bal-item-value-row','bal-item-note-row'].forEach(function(id){eid(id).hidden=kind==='group';});
  eid('bal-create-item').setAttribute('aria-pressed',String(kind==='item'));
  eid('bal-create-group').setAttribute('aria-pressed',String(kind==='group'));
  eid('bal-item-title').textContent=kind==='group'?'Nuevo grupo':(G.balItem&&G.balItem.codigo?'Editar ítem':'Nuevo ítem');
  eid('bal-item-nombre').placeholder=kind==='group'?'Nombre del grupo':'Nombre del ítem';
}
function guardarBalanceGrupoUI(){
  var name=eid('bal-item-nombre').value.trim(),btn=eid('bal-item-save');
  if(!name){showToast('Escribe el nombre del grupo','err');return;}
  btn.disabled=true;btn.textContent='Guardando...';
  gsRun('guardarBalanceGrupo',[{tipo:eid('bal-item-tipo').value,nombre:name}]).then(function(r){
    if(!r||!r.ok)throw Error(r&&r.error||'No se pudo crear el grupo');
    if(r.data)G.catalogo=r.data;
    eid('mov-bal-item').classList.remove('open');loadCatalogo();loadBalance();
    showToast('Grupo creado. Ya puedes agregarle ítems.','ok');
  }).catch(function(e){showToast(String(e.message||e),'err');}).finally(function(){btn.disabled=false;btn.textContent='Guardar';});
}
function savingsAssets(){
  return ((G.catalogo&&G.catalogo.activos)||[]).filter(function(a){return a.codigo!=='10101.05';});
}
function renderFundingHome(d){
  var old=eid('home-funding-summary');if(old)old.remove();
  if(!d.financiacion||!d.financiacion.desdeAhorros)return;
  var info=document.createElement('div');info.id='home-funding-summary';info.className='cat-manage-note';
  info.style.padding='10px 0';info.textContent='Egresos totales: '+fmt(d.financiacion.egresosTotales)+' · Financiados desde ahorros: '+fmt(d.financiacion.desdeAhorros)+'. El presupuesto disponible descuenta solo lo financiado con ingresos del mes.';
  eid('h-cats').appendChild(info);
}
function savingsOption(a){return '<option value="'+hEsc(a.codigo)+'">'+hEsc(a.nombre)+' · '+fmt(a.valor)+'</option>';}
function abrirGastoAhorros(tx){
  G.savingsMode=true;G.savingsEditingId=tx&&tx.id||null;G.savingsRequest=null;
  eid('savings-entry').hidden=true;eid('savings-panel').hidden=false;eid('savings-preview').hidden=false;
  eid('m-ti').textContent=tx?'Editar gasto desde ahorros':'Gasto desde ahorros';
  eid('savings-interest').value=tx?tx.interestAmount||0:0;
  eid('savings-destination-kind').value=tx?(['asset_transfer','savings_withdrawal'].indexOf(tx.operationCode)>=0?tx.operationCode:tx.tipo):'necesidad';
  eid('m-monto').oninput=previewSavings;
  qsa('#mov .tb').forEach(function(b){b.style.display='none';});
  eid('mov').querySelector('.tsb').parentElement.hidden=true;
  loadCatalogo().then(function(){
    eid('savings-source').innerHTML='<option value="">Selecciona el activo...</option>'+savingsAssets().map(savingsOption).join('');
    if(tx)eid('savings-source').value=tx.sourceAssetId;
    savingsDestinationChanged();
    if(tx){
      eid('m-sub').value=tx.subcategoria;eid('m-monto').value=tx.monto;
      eid('m-notas').value=tx.notas||'';
      var date=String(tx.fecha).split('/');eid('m-fecha').value=date.length===3?date.reverse().join('-'):tx.fecha;
      eid('m-mes-aplica').value=tx.mes;
      eid('savings-target').value=tx.destinationAssetId||tx.balanceId||'';
    }
    previewSavings();
  }).catch(function(e){showToast('No se pudieron cargar los saldos: '+e,'err');});
}
function savingsDestinationChanged(){
  var kind=eid('savings-destination-kind').value, transfer=['asset_transfer','savings_withdrawal'].indexOf(kind)>=0;
  eid('savings-target-box').hidden=!(transfer||kind==='deuda');
  eid('savings-interest-box').hidden=kind!=='deuda';
  eid('savings-target').innerHTML='<option value="">Selecciona...</option>'+
    (kind==='deuda'?((G.catalogo&&G.catalogo.pasivos)||[]):savingsAssets()).map(savingsOption).join('');
  setMovimientoTipo(transfer?'ingreso':kind);
  qsa('#mov .tb').forEach(function(b){b.style.display='none';});
  eid('m-balance-box').style.display='none';
  eid('m-sub').parentElement.hidden=transfer;
  eid('m-sub').onchange=function(){
    if(kind==='deuda'){var c=catalogFind('deuda',eid('m-sub').value);if(c)eid('savings-target').value=c.balanceId;}
    previewSavings();
  };
  if(kind!=='deuda')eid('savings-interest').value='0';
  previewSavings();
}
function previewSavings(){
  if(!G.savingsMode)return;
  var source=savingsAssets().find(function(a){return a.codigo===eid('savings-source').value;});
  var amount=moneyVal(eid('m-monto').value)||0, interest=moneyVal(eid('savings-interest').value)||0;
  var kind=eid('savings-destination-kind').value, transfer=['asset_transfer','savings_withdrawal'].indexOf(kind)>=0;
  var current=source?Number(source.valor):0;
  var original=(G.movimientos||[]).find(function(m){return m.id===G.savingsEditingId;});
  if(original&&source&&original.sourceAssetId===source.codigo)current+=original.monto;
  eid('savings-available').textContent='Saldo disponible: '+fmt(current)+(original?' (incluye la reversión del importe anterior)':'');
  var lines=[];
  if(source)lines.push(hEsc(source.nombre)+': '+fmt(current)+' → '+(current-amount<0?'-':'')+fmt(current-amount));
  if(transfer)lines.push('Traslado entre cuentas: '+fmt(amount)+' · sin ingreso ni gasto');
  else if(kind==='deuda')lines.push('Capital: '+fmt(amount-interest)+' · intereses y cargos: '+fmt(interest));
  else lines.push('Gasto en '+hEsc(eid('m-sub').value||'la categoría seleccionada')+': '+fmt(amount));
  if(kind==='deuda'&&eid('savings-target').value==='2010401.3')lines.push('Pago Terreno aumentará en '+fmt(amount-interest)+' según la regla vigente.');
  lines.push('Ingreso mensual: sin cambios','Disponible financiado por ingresos del mes: sin cambios');
  if(amount>current)lines.push('<strong class="tov2">Saldo insuficiente</strong>');
  eid('savings-preview').innerHTML=lines.map(function(l){return '<div style="font-size:12px;padding:4px 0">'+l+'</div>';}).join('');
  eid('btn-sv').textContent=G.savingsEditingId?'Confirmar cambios':'Confirmar y guardar';
}
function guardarGastoAhorros(){
  var btn=eid('btn-sv');if(btn.disabled)return;
  var kind=eid('savings-destination-kind').value,transfer=['asset_transfer','savings_withdrawal'].indexOf(kind)>=0;
  var amount=moneyVal(eid('m-monto').value),source=eid('savings-source').value;
  if(!source||!Number.isFinite(amount)||amount<=0||(!transfer&&!eid('m-sub').value)){showToast('Completa el origen, categoría e importe','err');return;}
  var p={tipo:transfer?'ingreso':kind,categoria:transfer?'patrimonio':kind,
    subcategoria:transfer?(kind==='asset_transfer'?'Transferencia entre activos':'Retiro sin gasto'):eid('m-sub').value,
    operationCode:transfer?kind:(kind==='deuda'?'savings_debt_payment':'savings_expense'),
    sourceAssetId:source,destinationAssetId:transfer?eid('savings-target').value:'',
    balanceCodigo:kind==='deuda'?eid('savings-target').value:'',interestAmount:kind==='deuda'?eid('savings-interest').value:'0',
    monto:String(amount),fecha:eid('m-fecha').value,mes:eid('m-mes-aplica').value,
    mesRegistro:mesDesdeFechaISO(eid('m-fecha').value),notas:eid('m-notas').value,
    returnState:true,includeMovimientos:true,homeMes:G.mesActual,histMes:G.histMes||G.mesActual};
  if(G.savingsEditingId)p.id=G.savingsEditingId;
  var signature=JSON.stringify(p);
  if(!G.savingsRequest||G.savingsRequest.signature!==signature)G.savingsRequest={signature:signature,id:crypto.randomUUID()};
  p._requestId=G.savingsRequest.id;
  btn.disabled=true;btn.textContent='Guardando...';
  var runner=google.script.run.withSuccessHandler(function(r){
    btn.disabled=false;btn.textContent='Confirmar y guardar';
    if(!r||!r.ok){showToast(r&&r.error||'No se pudo guardar','err');return;}
    eid('mov').classList.remove('open');G.savingsRequest=null;
    if(r.state)aplicarPostChangeState(r.state);
    G._dirtyBalance=true;G._dirtyFlujo=true;G._dirty=true;
    syncTrasCambio({delay:80,mesInicio:G.mesActual,mesHist:G.histMes||p.mes,historial:true,flujo:true,balance:true});
    loadCatalogo();showToast('Operación guardada','ok');
  }).withFailureHandler(function(e){btn.disabled=false;btn.textContent='Reintentar';showToast('No se pudo confirmar: '+e+'. Puedes reintentar sin duplicar.','err');});
  if(G.savingsEditingId)runner.actualizarMovimiento(p);else runner.registrarMovimiento(p);
}
function renderFundingDetail(tx){
  var el=eid('hist-detail-body');
  if(tx.fundedAmount)el.insertAdjacentHTML('beforeend','<div class="detail-line"><span>Financiado desde ahorros</span><strong>'+fmt(tx.fundedAmount)+'</strong></div>');
  if(tx.principalAmount||tx.interestAmount)el.insertAdjacentHTML('beforeend','<div class="detail-line"><span>Capital / intereses</span><strong>'+fmt(tx.principalAmount)+' / '+fmt(tx.interestAmount)+'</strong></div>');
  (tx.fundingLinks||[]).forEach(function(link){
    var div=document.createElement('div');div.className='cat-manage-note';
    div.textContent='Origen: '+(link.source_name||link.source_asset_id||'Ahorros')+' · operación '+fmt(link.amount);
    el.appendChild(div);
  });
  if(tx.fundedAmount||tx.nonIncome||tx.balanceId){var button=document.createElement('button');button.className='btn bgh bful';button.textContent='Ver en el historial del Balance General';button.onclick=function(){openFundingHistory(tx);};el.appendChild(button);}
}
function reconciliationLabel(value){return {reconciled:'Conciliado',adjusted:'Conciliado con ajuste documentado',partial:'Parcialmente conciliado',pending:'Pendiente de conciliación',cancelled:'Anulado'}[value]||value;}
function operationLabel(value){return {savings_expense:'Gasto desde ahorros',savings_debt_payment:'Pago de deuda desde ahorros',savings_contribution:'Aportación de ahorro',savings_withdrawal:'Retiro de ahorro',asset_transfer:'Transferencia entre activos',debt_payment:'Pago de deuda',asset_contribution:'Aportación a activo',loan_collection:'Cobro de préstamo',loan_received:'Préstamo recibido',reversal:'Reversión',historical_correction:'Corrección histórica',automatic:'Cambio automático',create:'Creación',deactivate:'Inactivación',delete:'Eliminación'}[value]||value;}
function openFundingHistory(tx){
  G.balanceHistoryFocus=tx.id;eid('mov-hist-detail').classList.remove('open');
  google.script.run.withSuccessHandler(function(r){if(r&&r.ok){G.balance=r;renderBalanceLog(r.cambios);eid('mov-bal-log').classList.add('open');}}).getBalanceGeneral();
}
function showLinkedTransaction(id,month){
  google.script.run.withSuccessHandler(function(r){
    if(!r||!r.ok)return;G.histMes=month;G.movimientos=r.data;cacheSetMovimientos(month,r.data);
    eid('mov-bal-log').classList.remove('open');abrirDetalleHistorial(id);
  }).getMovimientosMes(month);
}
function renderCategoryFunding(items,cat){
  if(cat.aho)return;
  var funded=items.reduce(function(s,i){return s+(i.desdeAhorros||0);},0);
  if(!funded)return;
  var html='<div class="lup" style="margin:16px 0 8px">Origen de financiación</div>';
  items.filter(function(i){return i.desdeAhorros>0;}).forEach(function(i){html+='<div class="card p12 cr12" style="margin-bottom:8px"><b>'+hEsc(i.nombre)+'</b><div class="cat-manage-note">Ingresos del mes: '+fmt(i.desdeIngresos)+' · Ahorros: '+fmt(i.desdeAhorros)+' · Total: '+fmt(i.gastoTotal)+'</div></div>';});
  eid('cat-modal-tabla').insertAdjacentHTML('beforeend',html);
}
function renderFullBalanceHistory(items,targetId){
  var el=eid(targetId||'bal-log-modal-list');if(!el)return;
  var all=items||[],ops=(G.balance&&G.balance.fundingOperations)||[],filter=G.balanceHistoryFilter||{};
  el.textContent='';
  var controls=document.createElement('div');controls.className='m-date-row';el.appendChild(controls);
  function select(label,key,values){
    var box=document.createElement('label');box.className='fg';box.textContent=label;
    var field=document.createElement('select');field.className='fs';field.setAttribute('aria-label',label);
    field.add(new Option('Todos',''));
    values.forEach(function(v){field.add(new Option(v[1],v[0]));});field.value=filter[key]||'';
    field.onchange=function(){filter[key]=field.value;G.balanceHistoryFilter=filter;G.balanceHistoryFocus=null;renderFullBalanceHistory(all,targetId);};
    box.appendChild(field);controls.appendChild(box);
  }
  function period(x){var s=String(x.fechaHora||'');var m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);return m?m[3]+'-'+m[2].padStart(2,'0'):s.slice(0,7);}
  select('Periodo','period',Array.from(new Set(all.map(period).filter(Boolean))).sort().reverse().map(function(p){return[p,p];}));
  var accounts=new Map();all.forEach(function(x){accounts.set(x.codigo,x.nombre||x.codigo);});
  select('Activo o pasivo','account',Array.from(accounts));
  select('Movimiento','type',Array.from(new Set(all.map(function(x){return x.accion;}).concat(ops.map(function(o){return o.operation_code;})))).filter(Boolean).map(function(t){return[t,operationLabel(t)];}));
  select('Conciliación','state',['reconciled','adjusted','partial','pending','cancelled'].map(function(s){return[s,reconciliationLabel(s)];}));
  var focus=G.balanceHistoryFocus;
  if(!focus){((G.balance&&G.balance.reconciliationCases)||[]).filter(function(c){return (!filter.account||c.balance_id===filter.account)&&(!filter.state||c.state===filter.state)&&!filter.type&&(!filter.period||c.period===filter.period||c.period==='2026');}).forEach(function(c){
    var box=document.createElement('details');box.className='card p12 cr12';box.style.marginTop='10px';
    var summary=document.createElement('summary');summary.textContent=(c.account_name||c.case_key)+' · '+reconciliationLabel(c.state);box.appendChild(summary);
    var note=document.createElement('p');note.className='cat-manage-note';note.textContent=c.note;box.appendChild(note);el.appendChild(box);
  });}
  if(focus){var clear=document.createElement('button');clear.className='btn bgh bful';clear.textContent='Mostrar todo el historial';clear.onclick=function(){G.balanceHistoryFocus=null;renderFullBalanceHistory(all,targetId);};el.appendChild(clear);}
  var filteredOps=ops.filter(function(o){return (!filter.account||[o.source_asset_id,o.destination_asset_id].indexOf(filter.account)>=0)&&(!filter.state||o.state===filter.state)&&(!filter.type||o.operation_code===filter.type)&&(!filter.period||String(o.economic_date||'').slice(0,7)===filter.period)&&(!focus||o.source_movement_id===focus||(o.allocations||[]).some(function(a){return a.movement_id===focus;}));});
  filteredOps.forEach(function(o){
    var detail=document.createElement('details');detail.className='card p12 cr12';detail.style.marginTop='10px';
    var summary=document.createElement('summary');summary.textContent=(o.economic_date||'Fecha por verificar')+' · '+operationLabel(o.operation_code)+' · '+fmt(o.amount);detail.appendChild(summary);
    var text=document.createElement('div');text.className='cat-manage-note';
    var allocated=(o.allocations||[]).reduce(function(s,a){return s+Number(a.amount);},0);
    text.textContent=(o.source_name||'Origen pendiente')+(o.destination_name?' → '+o.destination_name:'')+' · '+reconciliationLabel(o.state)+' · '+o.note;
    detail.appendChild(text);
    (o.allocations||[]).forEach(function(a){
      var row=document.createElement('div');row.className='detail-line';row.textContent=a.category+' · '+fmt(a.amount)+(a.movement_id?'':' · vinculación transaccional pendiente');detail.appendChild(row);
      if(a.movement_id){var button=document.createElement('button');button.className='btn bgh bful';button.textContent='Ver transacción · '+a.movement_id;button.onclick=function(){showLinkedTransaction(a.movement_id,a.month);};detail.appendChild(button);}
    });
    if((o.allocations||[]).length){var remainder=document.createElement('div');remainder.className='cat-manage-note';remainder.textContent='Distribuido: '+fmt(allocated)+' · Pendiente de destino: '+fmt(Number(o.amount)-allocated);detail.appendChild(remainder);}
    el.appendChild(detail);
  });
  var filtered=all.filter(function(x){return (!filter.period||period(x)===filter.period)&&(!filter.account||x.codigo===filter.account)&&(!filter.type||x.accion===filter.type)&&(!filter.state||x.estado===filter.state)&&(!focus||x.movimientoId===focus||(x.transacciones||[]).some(function(t){return t.id===focus;})||filteredOps.some(function(o){return o.operation_id===x.operationId;}));});
  filtered.forEach(function(x){
    var detail=document.createElement('details');detail.className='card p12 cr12';detail.style.marginTop='10px';
    var ordering=/^(ordenar|reorder|orden)$/i.test(x.accion||'');
    var summary=document.createElement('summary');var delta=ordering||x.anterior==null||x.nuevo==null?null:x.nuevo-x.anterior;
    summary.textContent=(x.fechaHora||x.fecha||'')+' · '+operationLabel(x.accion)+' · '+(x.nombre||x.codigo)+(delta==null?'':' · '+(delta<0?'−':'+')+fmt(delta));detail.appendChild(summary);
    var body=document.createElement('div');body.className='cat-manage-note';body.textContent=(ordering?'Cambio de orden; no representa una variación de saldo.':'Saldo: '+(x.anterior==null?'Sin dato':fmt(x.anterior))+' → '+(x.nuevo==null?'Sin dato':fmt(x.nuevo)))+' · '+reconciliationLabel(x.estado)+' · '+(x.nota||'')+(x.movimientoId?' · Movimiento '+x.movimientoId:'');detail.appendChild(body);
    (x.transacciones||[]).forEach(function(t){var button=document.createElement('button');button.className='btn bgh bful';button.textContent='Ver '+t.subcategory+' · '+fmt(t.amount);button.onclick=function(){showLinkedTransaction(t.id,t.month);};detail.appendChild(button);});
    el.appendChild(detail);
  });
  if(!filtered.length&&!filteredOps.length){var empty=document.createElement('p');empty.className='cat-manage-note';empty.textContent='No hay movimientos para estos filtros.';el.appendChild(empty);}
}
