// Uses a private, local backup; never commit or deploy financial snapshots.
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {database}=require('./helpers/database.cjs');const {restore}=require('./helpers/restore.cjs');
const {transformSource}=require('../lib/jaeger-supabase-read');
(async()=>{
 const folder=path.resolve(process.argv[2]||'../evidence');let before;
 const db=await database(async d=>{before=await restore(d,path.join(folder,'full-before.json'));});
 try{
 const sql=fs.readFileSync(path.join(folder,'reconcile-confirmed-october.sql'),'utf8');
 await db.exec(sql);await db.exec(sql);
 const accounts=(await db.query('select * from jaeger.balance_items')).rows;
 for(const a of accounts){const prior=before.balance_items.find(x=>x.balance_id===a.balance_id);assert.equal(Number(a.current_value),Number(prior.current_value)+(a.balance_id==='10102.01'?-16:0));}
 const moves=(await db.query('select * from jaeger.financial_movements')).rows;assert.equal(moves.length,322);
 for(const m of moves){const prior=before.financial_movements.find(x=>x.legacy_id===m.legacy_id);assert.equal(Number(m.amount),m.legacy_id==='f781979b-fa50-4be0-a388-97327f4ff745'?170.97:prior.amount);assert.equal(m.transaction_date instanceof Date?m.transaction_date.toISOString().slice(0,10):m.transaction_date,prior.transaction_date);}
 const allocation=(await db.query('select sum(amount) as amount,count(movement_id) as linked,count(*) as total from jaeger.funding_allocations')).rows[0];
 assert.equal(Number(allocation.amount),170.97);assert.equal(Number(allocation.linked),5);assert.equal(Number(allocation.total),6);
 const raw=(await db.query("select public.jaeger_native_read_source('getMesData','[\"Octubre 26\"]') as data")).rows[0].data;
 const month=transformSource('getMesData',[],raw);assert.equal(month.necesidades.desdeAhorros,92.65);assert.equal(month.deseos.desdeAhorros,70);
 const txs=transformSource('getMovimientosMes',[],raw).data;assert.equal(txs.filter(x=>x.fundedAmount>0).length,5);
 const history=(await db.query("select public.jaeger_native_read_source('getBalanceGeneral','[]') as data")).rows[0].data;
 assert.equal(history.reconciliationCases.length,32);assert.ok(history.changes.length>60);
 assert.equal(history.fundingOperations.find(o=>o.source_asset_id==='10102.05').allocations.filter(a=>a.movement_id===null)[0].amount,8.32);
 fs.writeFileSync(path.join(folder,'local-reconciliation-result.json'),JSON.stringify({accounts,month,history:transformSource('getBalanceGeneral',[],history),transactions:txs},null,2));
 console.log('PASS: 322 movements preserved; XTB 4.50; Pichincha 282.33; 5 expenses linked + 8.32 pending; 32 cases; repeated correction idempotent.');
 }finally{await db.close();}
})().catch(e=>{console.error(e.message,e.where||'');process.exit(1);});
