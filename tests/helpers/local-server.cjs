// Local integration environment: real API handlers, local PostgreSQL and a private snapshot.
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const {database}=require('./database.cjs');const {restore}=require('./restore.cjs');
const root=path.resolve(__dirname,'../..'),evidence=path.resolve(root,'../evidence');
const port=4173;
process.env.APP_ACCESS_KEY='local-test';process.env.SUPABASE_URL=`http://127.0.0.1:${port}`;
process.env.SUPABASE_SECRET_KEY='sb_secret_local_fixture';process.env.SUPABASE_PRIMARY_READS='1';
const api=require('../../api/apps-script');const readApi=require('../../api/supabase');
(async()=>{
 const db=await database(d=>restore(d,path.join(evidence,'full-before.json')));
 await db.exec(fs.readFileSync(path.join(evidence,'reconcile-confirmed-october.sql'),'utf8'));
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');let raw='';for await(const chunk of req)raw+=chunk;
  res.status=function(n){res.statusCode=n;return res;};res.json=function(x){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(x));return res;};
  res.send=function(x){res.end(x);return res;};
  try{
   if(url.pathname.startsWith('/rest/v1/rpc/')){
    const fn=url.pathname.split('/').pop();if(!/^jaeger_[a-z_]+$/.test(fn))return res.status(404).json({error:'Not found'});
    const payload=raw?JSON.parse(raw):{},entries=Object.entries(payload);
    const args=entries.map(([k,v],i)=>{if(!/^p_[a-z_]+$/.test(k))throw Error('Invalid argument');return `${k}=>$${i+1}`;});
    const result=await db.query(`select public.${fn}(${args.join(',')}) as result`,entries.map(([,v])=>typeof v==='object'?JSON.stringify(v):v));
    return res.json(result.rows[0].result);
   }
   if(url.pathname.startsWith('/rest/v1/jaeger_cache_control'))return res.json([{generation:1}]);
   if(url.pathname.startsWith('/rest/v1/'))return res.json([]);
   if(url.pathname==='/api/apps-script'||url.pathname==='/api/supabase'){
    req.body=raw?JSON.parse(raw):{};console.log(req.body.fn);
    return await(url.pathname.endsWith('supabase')?readApi:api)(req,res);
   }
   const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.status(404).end();
   const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'})[ext]||'text/plain');
   res.end(fs.readFileSync(file));
  }catch(e){console.error('LOCAL:',e.message);res.status(400).json({message:e.message,code:e.code||'LOCAL'});}
 });
 server.listen(port,'127.0.0.1',()=>console.log('Local integration server http://127.0.0.1:'+port));
})().catch(e=>{console.error(e.message);process.exit(1);});
