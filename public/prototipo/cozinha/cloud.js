/* =====================================================================
   PONTE COM A NUVEM (Supabase) — Premium Pizzas
   Biblioteca compartilhada por TODOS os apps (site, PDV, cozinha, delivery).
   Liga cada app no mesmo "cérebro". Copiar este arquivo na pasta de cada app.
   ===================================================================== */
window.PZCLOUD = (function(){
  const BASE = "https://etprijbcdukqwsndsnez.supabase.co/rest/v1/";
  const KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0cHJpamJjZHVrcXdzbmRzbmV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2Njc0MjEsImV4cCI6MjA5NTI0MzQyMX0.VQB1NZ_M9wqrw5AMwbHuh8tazRegX8kMzCI4YOgZO5o";
  const H = {"apikey":KEY,"Authorization":"Bearer "+KEY,"Content-Type":"application/json"};
  let _unid=null;
  async function get(path){ const r=await fetch(BASE+path,{headers:H}); if(!r.ok) throw new Error("GET "+path+" "+r.status+" "+(await r.text())); return r.json(); }
  async function post(table,body,prefer="return=representation"){ const r=await fetch(BASE+table,{method:"POST",headers:{...H,"Prefer":prefer},body:JSON.stringify(body)}); if(!r.ok) throw new Error("POST "+table+" "+r.status+" "+(await r.text())); return prefer.includes("representation")?r.json():null; }
  async function patch(table,query,body){ const r=await fetch(BASE+table+"?"+query,{method:"PATCH",headers:{...H,"Prefer":"return=representation"},body:JSON.stringify(body)}); if(!r.ok) throw new Error("PATCH "+table+" "+r.status+" "+(await r.text())); return r.json(); }
  async function del(table,query){ const r=await fetch(BASE+table+"?"+query,{method:"DELETE",headers:H}); if(!r.ok) throw new Error("DELETE "+r.status); return true; }
  async function unidade(){ if(!_unid){ const u=await get("unidades?select=id,nome&limit=1"); _unid=u[0]; } return _unid; }
  return {get,post,patch,del,unidade,BASE,KEY};
})();
