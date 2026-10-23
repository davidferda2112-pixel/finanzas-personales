const fs=require('node:fs');
async function restore(db,filename){
 const backup=JSON.parse(fs.readFileSync(filename,'utf8'));
 for(const [table,rows] of Object.entries(backup)){
   if(!Array.isArray(rows)||!rows.length)continue;
   if(!/^[a-z_]+$/.test(table))throw Error('Invalid table');
   await db.exec(`alter table jaeger.${table} disable trigger user`);
   const cols=Object.keys(rows[0]).map(c=>'"'+c+'"').join(',');
   await db.query(`insert into jaeger.${table} (${cols}) select ${cols} from jsonb_populate_recordset(null::jaeger.${table},$1::jsonb)`,[JSON.stringify(rows)]);
   await db.exec(`alter table jaeger.${table} enable trigger user`);
 }
 const ids=(await db.query("select table_schema,table_name,column_name from information_schema.columns where is_identity='YES' and table_schema='jaeger'")).rows;
 for(const c of ids)await db.exec(`select setval(pg_get_serial_sequence('${c.table_schema}.${c.table_name}','${c.column_name}'),greatest(coalesce((select max(${c.column_name}) from ${c.table_schema}.${c.table_name}),0)+1,1),false)`);
 return backup;
}
module.exports={restore};
