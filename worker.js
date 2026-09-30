const ALLOW_ORIGIN="https://kotobukishokai4922-hue.github.io";
const YAHOO="https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch";
const cors={"Access-Control-Allow-Origin":ALLOW_ORIGIN,"Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"Content-Type","Vary":"Origin"};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
export default {async fetch(request,env){
 if(request.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
 if(request.method!=="GET") return json({error:"METHOD_NOT_ALLOWED"},405);
 const u=new URL(request.url), jan=(u.searchParams.get("jan")||"").trim();
 if(!/^\d{13}$/.test(jan)) return json({error:"INVALID_JAN"},400);
 if(!env.YAHOO_APP_ID) return json({error:"SERVER_NOT_CONFIGURED"},503);
 const y=new URL(YAHOO);y.searchParams.set("appid",env.YAHOO_APP_ID);y.searchParams.set("jan_code",jan);y.searchParams.set("condition","new");y.searchParams.set("results","50");y.searchParams.set("sort","+price");
 let r;try{r=await fetch(y,{headers:{Accept:"application/json"}})}catch(e){return json({error:"YAHOO_NETWORK_ERROR"},502)}
 if(!r.ok) return json({error:"YAHOO_HTTP_ERROR",status:r.status},502);
 let d;try{d=await r.json()}catch(e){return json({error:"YAHOO_INVALID_JSON"},502)}
 const exact=(Array.isArray(d.hits)?d.hits:[]).filter(h=>String(h.janCode||"")===jan);
 if(!exact.length) return json({jan,name:"",price:null,inStock:null,source:"Yahoo!ショッピング",url:""});
 const stocked=exact.filter(h=>h.inStock===true), pool=stocked.length?stocked:exact;
 const hit=pool.reduce((a,b)=>Number(b.price)<Number(a.price)?b:a);
 return json({jan,name:hit.name||"",price:Number.isFinite(Number(hit.price))?Number(hit.price):null,inStock:typeof hit.inStock==="boolean"?hit.inStock:null,source:"Yahoo!ショッピング",url:hit.url||""});
}};