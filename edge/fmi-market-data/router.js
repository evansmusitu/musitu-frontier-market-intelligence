const JSON_HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};
const PLAN_LIMITS={FREE:64,FOUNDING:256,PRO:512,INSTITUTIONAL:2048};
const ROUTABLE_HTTP=new Map([[401,'ENTITLEMENT_DENIED'],[403,'ENTITLEMENT_DENIED'],[404,'NOT_SUPPORTED'],[408,'UNAVAILABLE'],[425,'UNAVAILABLE'],[429,'RATE_LIMITED'],[500,'UNAVAILABLE'],[502,'UNAVAILABLE'],[503,'UNAVAILABLE'],[504,'UNAVAILABLE']]);
const ALIAS=new Map([
  ['EUR/USD','EURUSD'],['GBP/USD','GBPUSD'],['USD/JPY','USDJPY'],['AUD/USD','AUDUSD'],['NZD/USD','NZDUSD'],['USD/CHF','USDCHF'],['USD/CAD','USDCAD'],
  ['XAU/USD','XAUUSD'],['GOLD','XAUUSD'],['XAG/USD','XAGUSD'],['SILVER','XAGUSD'],['BTC/USD','BTCUSD'],['BITCOIN','BTCUSD'],['ETH/USD','ETHUSD'],['ETHEREUM','ETHUSD'],
  ['S&P500','SPX'],['SP500','SPX'],['NASDAQ100','NDX'],['NAS100','NDX'],['DOLLAR INDEX','DXY'],
]);
const now=()=>new Date().toISOString();
const out=(status,body)=>new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
const text=(v,n=96)=>String(v??'').trim().slice(0,n);
const finite=v=>Number.isFinite(Number(v));
function canonicalSymbol(raw){
  const clean=text(raw,40).toUpperCase().replace(/\s+/g,' ');
  const mapped=ALIAS.get(clean)||clean;
  return /^[A-Z0-9._:-]{1,32}$/.test(mapped)?mapped:null;
}
function marketClassFor(symbol){
  if(['EURUSD','GBPUSD','USDJPY','AUDUSD','NZDUSD','USDCHF','USDCAD'].includes(symbol))return 'FOREX';
  if(['XAUUSD','XAGUSD'].includes(symbol))return 'COMMODITIES';
  if(['BTCUSD','ETHUSD'].includes(symbol))return 'CRYPTO';
  if(['SPY','QQQ'].includes(symbol))return 'ETF';
  if(['AAPL','MSFT','NVDA','TSLA'].includes(symbol))return 'EQUITY';
  if(['SPX','NDX','DXY'].includes(symbol))return 'INDEX';
  return null;
}
function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  return value;
}
async function sha256(value){const b=new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(stable(value)));const d=await crypto.subtle.digest('SHA-256',b);return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function validTimestamp(v){const n=Date.parse(String(v||''));return Number.isFinite(n)?n:null}
function routeFailure(role,reason,http_status=null,provider=null){return {kind:'ROUTABLE_FAILURE',role,reason,http_status,provider:provider||null,health:reason==='RATE_LIMITED'?'DEGRADED':'UNAVAILABLE'}}
function integrityFailure(role,reason,http_status=null,provider=null){return {kind:'INTEGRITY_FAILURE',role,reason,http_status,provider:provider||null,health:'INVALID'}}
function normalizeQuote(q){if(q==null)return {ok:true,value:null};const bid=Number(q.bid),ask=Number(q.ask);if(!Number.isFinite(bid)||!Number.isFinite(ask)||bid<0||ask<bid)return {ok:false};return {ok:true,value:{bid,ask}}}
function normalizeImbalance(v){if(v==null)return {ok:true,value:null};const n=Number(v);return Number.isFinite(n)&&n>=-1&&n<=1?{ok:true,value:n}:{ok:false}}
async function normalizeRights(r,rightsHash,provider,symbol){
  if(!r||typeof r!=='object'||Array.isArray(r)||!/^[0-9a-f]{64}$/i.test(String(rightsHash||'')))return null;
  const allowed=['schema','provider','rights_reference_hash','license_authorized','redistribution_authorized','external_api_authorized','market_class','max_retention_seconds','effective_at','expires_at','attribution','raw_provider_data_persisted'];
  if(Object.keys(r).some(k=>!allowed.includes(k)))return null;
  const marketClass=marketClassFor(symbol),effective=text(r.effective_at,64),expires=text(r.expires_at,64),e=validTimestamp(effective),x=validTimestamp(expires),retention=Number(r.max_retention_seconds);
  const a=r.attribution;if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['required','text','url'].includes(k)))return null;
  const required=a.required;if(typeof required!=='boolean')return null;
  const attrText=required?text(a.text,160):null,attrUrl=required?text(a.url,256):null;
  if(required&&(!attrText||!/^https:\/\//i.test(attrUrl)))return null;
  const normalized={schema:'musitu.fmi.provider-rights.v1',provider:text(r.provider,64),rights_reference_hash:String(r.rights_reference_hash||'').toLowerCase(),license_authorized:r.license_authorized,redistribution_authorized:r.redistribution_authorized,external_api_authorized:r.external_api_authorized,market_class:text(r.market_class,32).toUpperCase(),max_retention_seconds:retention,effective_at:e==null?'':new Date(e).toISOString(),expires_at:x==null?'':new Date(x).toISOString(),attribution:{required,text:required?attrText:null,url:required?attrUrl:null},raw_provider_data_persisted:r.raw_provider_data_persisted};
  if(normalized.provider!==provider||normalized.schema!==r.schema||!/^[0-9a-f]{64}$/.test(normalized.rights_reference_hash)||normalized.license_authorized!==true||normalized.redistribution_authorized!==true||normalized.external_api_authorized!==true||normalized.raw_provider_data_persisted!==false||!marketClass||normalized.market_class!==marketClass||!Number.isInteger(retention)||retention<0||retention>315360000||e==null||x==null||!(e<=Date.now()&&Date.now()<x&&e<x))return null;
  const expected=await sha256(normalized);if(expected!==String(rightsHash).toLowerCase())return null;
  return {rights:normalized,rights_hash:expected};
}
function returnsFromBars(bars,max){
  if(!Array.isArray(bars)||bars.length<6)return null;
  const parsed=[];
  for(const b of bars){const ts=text(b?.timestamp||b?.time,64),ms=validTimestamp(ts),close=Number(b?.close);if(ms==null||!Number.isFinite(close)||close<=0)return null;parsed.push({timestamp:new Date(ms).toISOString(),ms,close})}
  for(let i=1;i<parsed.length;i++)if(parsed[i].ms<=parsed[i-1].ms)return null;
  const chosen=parsed.slice(-(Math.min(max,2048)+1));if(chosen.length<6)return null;
  const returns=[];for(let i=1;i<chosen.length;i++){const r=chosen[i].close/chosen[i-1].close-1;if(!Number.isFinite(r))return null;returns.push(r)}
  return {returns,bars:chosen.map(({timestamp,close})=>({timestamp,close})),observed_at:chosen.at(-1).timestamp,derivation:{input_kind:'BARS',method:'CLOSE_TO_CLOSE_DECIMAL',formula:'close_t/close_t_minus_1-1',observation_count:chosen.length,return_count:returns.length}};
}
function directReturns(values,max){
  if(!Array.isArray(values))return null;const arr=values.map(Number);if(arr.length<5||arr.length>Math.min(max,2048)||arr.some(x=>!Number.isFinite(x)))return null;
  return {returns:arr,bars:null,observed_at:null,derivation:{input_kind:'RETURNS',method:'UPSTREAM_DECIMAL_RETURNS',return_count:arr.length}};
}
function classifyNonOk(role,status,body){
  const provider=text(body?.provider,64)||null;
  const explicit=text(body?.category||body?.error_category,48).toUpperCase();
  const allowed=new Set(['UNAVAILABLE','NOT_SUPPORTED','ENTITLEMENT_DENIED','RATE_LIMITED']);
  const reason=allowed.has(explicit)?explicit:ROUTABLE_HTTP.get(status);
  return reason?routeFailure(role,reason,status,provider):integrityFailure(role,'UPSTREAM_REJECTED',status,provider);
}
async function callAdapter(binding,role,ctx){
  if(!binding||typeof binding.fetch!=='function')return routeFailure(role,'NOT_BOUND');
  const u=new URL('https://provider-adapter.internal/v1/snapshot');u.searchParams.set('symbol',ctx.symbol);u.searchParams.set('horizon',ctx.horizon);u.searchParams.set('max_observations',String(ctx.max_observations));
  const headers=new Headers({'accept':'application/json','x-fmi-plan':ctx.plan,'x-fmi-market-scope':ctx.market_scope,'x-fmi-provider-role':role,'x-fmi-router-request-id':ctx.request_id});
  let res;try{res=await binding.fetch(new Request(u.toString(),{method:'GET',headers}))}catch{return routeFailure(role,'UNREACHABLE')}
  let raw;try{raw=await res.text()}catch{return routeFailure(role,'UNREACHABLE',res.status)}
  if(raw.length>262144)return integrityFailure(role,'RESPONSE_TOO_LARGE',res.status);
  let body;try{body=JSON.parse(raw||'{}')}catch{return integrityFailure(role,'INVALID_JSON',res.status)}
  if(!res.ok||body?.ok===false)return classifyNonOk(role,res.status,body);
  const provider=text(body?.provider,64),providerSymbol=text(body?.provider_symbol||body?.symbol,64),instrumentType=text(body?.instrument_type,32).toUpperCase(),entitlement=text(body?.entitlement,96);
  if(provider.length<2||providerSymbol.length<1||instrumentType.length<2||entitlement.length<1)return integrityFailure(role,'MISSING_PROVENANCE',res.status,provider||null);
  if(body?.entitled===false)return routeFailure(role,'ENTITLEMENT_DENIED',res.status,provider);
  const rightsProof=await normalizeRights(body?.rights,body?.rights_hash,provider,ctx.symbol);if(!rightsProof)return integrityFailure(role,'INVALID_RIGHTS_PROOF',res.status,provider);
  const fetchedMs=validTimestamp(body?.fetched_at),declaredObservedMs=validTimestamp(body?.observed_at);if(fetchedMs==null)return integrityFailure(role,'INVALID_FETCHED_AT',res.status,provider);
  if(fetchedMs>Date.now()+300000)return integrityFailure(role,'FETCH_CLOCK_SKEW',res.status,provider);
  const fromBars=returnsFromBars(body?.bars,ctx.max_observations);const series=fromBars||directReturns(body?.returns,ctx.max_observations);if(!series)return integrityFailure(role,'INVALID_OBSERVATIONS',res.status,provider);
  const observedAt=series.observed_at||String(body?.observed_at||'');const observedMs=validTimestamp(observedAt);if(observedMs==null||declaredObservedMs==null)return integrityFailure(role,'INVALID_OBSERVED_AT',res.status,provider);
  if(series.observed_at&&Math.abs(observedMs-declaredObservedMs)>1000)return integrityFailure(role,'OBSERVED_AT_BAR_MISMATCH',res.status,provider);
  if(observedMs>fetchedMs+300000)return integrityFailure(role,'OBSERVATION_CLOCK_SKEW',res.status,provider);
  const quote=normalizeQuote(body?.quote);if(!quote.ok)return integrityFailure(role,'INVALID_QUOTE',res.status,provider);const imbalance=normalizeImbalance(body?.order_book_imbalance);if(!imbalance.ok)return integrityFailure(role,'INVALID_IMBALANCE',res.status,provider);
  const upstreamSourceHash=/^[0-9a-f]{64}$/i.test(String(body?.source_hash||''))?String(body.source_hash).toLowerCase():null;if(body?.source_hash!=null&&!upstreamSourceHash)return integrityFailure(role,'INVALID_UPSTREAM_SOURCE_HASH',res.status,provider);
  const freshness=text(body?.freshness||'UNKNOWN',24).toUpperCase();const providerHealth=text(body?.provider_health||'HEALTHY',24).toUpperCase();if(!/^[A-Z0-9_:-]{2,24}$/.test(providerHealth))return integrityFailure(role,'INVALID_PROVIDER_HEALTH',res.status,provider);
  const sourceFacts={schema:'musitu.fmi.market-data.normalized-facts.v2',canonical_symbol:ctx.symbol,provider,provider_symbol:providerSymbol,instrument_type:instrumentType,horizon:ctx.horizon,observed_at:new Date(observedMs).toISOString(),fetched_at:new Date(fetchedMs).toISOString(),freshness,entitlement,rights:rightsProof.rights,rights_hash:rightsProof.rights_hash,derivation:series.derivation,bars:series.bars,returns:series.returns,quote:quote.value,order_book_imbalance:imbalance.value,upstream_source_hash:upstreamSourceHash};
  const sourceHash=await sha256(sourceFacts);
  return {kind:'SUCCESS',role,provider,health:providerHealth,data:{ok:true,symbol:ctx.symbol,provider_symbol:providerSymbol,instrument_type:instrumentType,provider,observed_at:sourceFacts.observed_at,fetched_at:sourceFacts.fetched_at,freshness,entitlement,rights:rightsProof.rights,rights_hash:rightsProof.rights_hash,returns:series.returns,quote:quote.value,order_book_imbalance:imbalance.value,source_hash:sourceHash,upstream_source_hash:upstreamSourceHash,derivation:series.derivation}};
}
function safeRoute(r){return {role:r.role,state:r.kind==='SUCCESS'?'SELECTED':r.reason,provider:r.provider||null,health:r.health||null,http_status:r.http_status||null}}
async function context(req,env){
  const url=new URL(req.url),symbol=canonicalSymbol(url.searchParams.get('symbol')),horizon=text(url.searchParams.get('horizon')||'NEXT_4H',32).toUpperCase();if(!symbol)return out(400,{ok:false,error:'invalid_market_symbol'});if(!/^[A-Z0-9_:-]{1,32}$/.test(horizon))return out(400,{ok:false,error:'invalid_market_horizon'});
  const plan=text(req.headers.get('x-fmi-plan'),24).toUpperCase(),marketScope=text(req.headers.get('x-fmi-market-scope'),64),customerId=text(req.headers.get('x-fmi-customer-id'),128);if(!PLAN_LIMITS[plan]||!marketScope||!customerId)return out(401,{ok:false,error:'router_principal_required'});
  const requested=Number(url.searchParams.get('max_observations')||256);if(!Number.isInteger(requested)||requested<5)return out(400,{ok:false,error:'invalid_max_observations'});const max=Math.min(requested,PLAN_LIMITS[plan],2048),requestId=crypto.randomUUID();const ctx={symbol,horizon,max_observations:max,plan,market_scope:marketScope,request_id:requestId};
  const primary=await callAdapter(env.FMI_MARKET_PRIMARY,'PRIMARY',ctx);
  if(primary.kind==='INTEGRITY_FAILURE')return out(502,{ok:false,error:'provider_integrity_failed',provider_state:'INVALID',failure:safeRoute(primary),fallback_attempted:false,manual_fallback:true,authority:{market_context_only:true,live_trading:false,trade_execution:false}});
  let selected=primary,fallback=null,fallbackReason=null;
  if(primary.kind!=='SUCCESS'){
    fallbackReason='PRIMARY_'+primary.reason;fallback=await callAdapter(env.FMI_MARKET_FALLBACK,'FALLBACK',ctx);
    if(fallback.kind==='INTEGRITY_FAILURE')return out(502,{ok:false,error:'provider_integrity_failed',provider_state:'INVALID',primary:safeRoute(primary),failure:safeRoute(fallback),fallback_attempted:true,fallback_reason:fallbackReason,manual_fallback:true,authority:{market_context_only:true,live_trading:false,trade_execution:false}});
    if(fallback.kind!=='SUCCESS')return out(503,{ok:false,error:'market_provider_unavailable',provider_state:'UNAVAILABLE',primary:safeRoute(primary),fallback:safeRoute(fallback),fallback_attempted:true,fallback_reason:fallbackReason,manual_fallback:true,authority:{market_context_only:true,live_trading:false,trade_execution:false}});
    selected=fallback;
  }
  const routing={policy:'EXPLICIT_FAILOVER_V1',primary:safeRoute(primary),fallback:fallback?safeRoute(fallback):null,selected_role:selected.role,selected_provider:selected.provider,fallback_used:selected.role==='FALLBACK',fallback_reason:selected.role==='FALLBACK'?fallbackReason:null,customer_identity_forwarded_to_provider:false,bearer_forwarded_to_provider:false};
  return out(200,{...selected.data,routing,provider_health:selected.health,router:{schema:'musitu.fmi.market-data-router.v1',request_id:requestId,max_observations:max,plan,market_scope:marketScope},authority:{market_context_only:true,paper_shadow_only:true,live_trading:false,trade_execution:false},manual_fallback:false});
}
async function health(env){return out(200,{ok:true,status:'ok',service:'MUSITU_FMI_MARKET_DATA_ROUTER',authority:'MARKET_CONTEXT_ONLY',primary_binding:!!env.FMI_MARKET_PRIMARY,fallback_binding:!!env.FMI_MARKET_FALLBACK,public_exposure_required:false,live_trading:false,trade_execution:false})}
export default {async fetch(req,env){const u=new URL(req.url);if(req.method==='GET'&&u.pathname==='/healthz')return health(env);if(req.method==='GET'&&u.pathname==='/v1/context')return context(req,env);return out(404,{ok:false,error:'not_found'})}};
