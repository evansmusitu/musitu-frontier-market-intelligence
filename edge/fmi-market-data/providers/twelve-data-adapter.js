const JSON_HEADERS={
  'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};
const PROVIDER='Twelve Data',BASE='https://api.twelvedata.com',MAX_BODY=524288;
const PAIRS=new Map([
  ['EURUSD',['EUR/USD','FOREX']],['GBPUSD',['GBP/USD','FOREX']],['USDJPY',['USD/JPY','FOREX']],['AUDUSD',['AUD/USD','FOREX']],['NZDUSD',['NZD/USD','FOREX']],['USDCHF',['USD/CHF','FOREX']],['USDCAD',['USD/CAD','FOREX']],
  ['XAUUSD',['XAU/USD','COMMODITIES']],['XAGUSD',['XAG/USD','COMMODITIES']],['BTCUSD',['BTC/USD','CRYPTO']],['ETHUSD',['ETH/USD','CRYPTO']],
]);
const UNVERIFIED_INDEX_SYMBOLS=new Set(['SPX','NDX','DXY']);
const HORIZON_INTERVAL=new Map([['NEXT_1H','5min'],['NEXT_4H','15min'],['NEXT_SESSION','30min'],['NEXT_DAY','1h']]);
const out=(status,body)=>new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
const txt=(v,n=96)=>String(v??'').trim().slice(0,n);
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value}
async function sha256(value){const b=new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(stable(value)));const d=await crypto.subtle.digest('SHA-256',b);return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function pairInfo(raw){const s=txt(raw,32).toUpperCase();if(PAIRS.has(s)){const [symbol,marketClass]=PAIRS.get(s);return {canonical:s,symbol,market_class:marketClass}}if(UNVERIFIED_INDEX_SYMBOLS.has(s))return null;return null}
function intervalFor(horizon){return HORIZON_INTERVAL.get(txt(horizon,32).toUpperCase())||null}
function utcTimestamp(value){const s=txt(value,64);if(!s)return null;const candidate=/[zZ]|[+-]\d\d:?\d\d$/.test(s)?s:s.replace(' ','T')+'Z';const ms=Date.parse(candidate);return Number.isFinite(ms)?new Date(ms).toISOString():null}
function classifyProviderError(status,body){const code=Number(body?.code)||status,error=txt(body?.message||body?.error||'provider_rejected',192);if(code===401||code===403)return {http:403,category:'ENTITLEMENT_DENIED',error};if(code===404)return {http:404,category:'NOT_SUPPORTED',error};if(code===429)return {http:429,category:'RATE_LIMITED',error};if(code>=500)return {http:503,category:'UNAVAILABLE',error};return {http:502,category:'INTEGRITY_FAILURE',error}}
function safeInstrumentType(v){const s=txt(v,48).toUpperCase();return /^[A-Z0-9 _./&()-]{2,48}$/.test(s)?s:null}
function csvSet(v){return new Set(String(v||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean))}
function parseBool(v){const s=String(v??'').trim().toLowerCase();return s==='true'?true:s==='false'?false:null}
async function rightsProfile(env,marketClass){
  if(String(env.TWELVE_DATA_LICENSE_AUTHORIZED||'').toLowerCase()!=='true')return {ok:false,http:403,category:'ENTITLEMENT_DENIED',error:'provider_license_not_authorized'};
  if(String(env.TWELVE_DATA_REDISTRIBUTION_AUTHORIZED||'').toLowerCase()!=='true')return {ok:false,http:403,category:'ENTITLEMENT_DENIED',error:'provider_redistribution_not_authorized'};
  if(String(env.TWELVE_DATA_EXTERNAL_API_AUTHORIZED||'').toLowerCase()!=='true')return {ok:false,http:403,category:'ENTITLEMENT_DENIED',error:'provider_external_api_not_authorized'};
  const ref=String(env.TWELVE_DATA_RIGHTS_REFERENCE||'').trim(),effective=utcTimestamp(env.TWELVE_DATA_RIGHTS_EFFECTIVE_AT),expires=utcTimestamp(env.TWELVE_DATA_RIGHTS_EXPIRES_AT),allowed=csvSet(env.TWELVE_DATA_ALLOWED_MARKET_CLASSES),retention=Number(env.TWELVE_DATA_MAX_RETENTION_SECONDS),attrRequired=parseBool(env.TWELVE_DATA_ATTRIBUTION_REQUIRED);
  if(!ref||!effective||!expires||!Number.isInteger(retention)||retention<0||retention>315360000||attrRequired==null||allowed.size<1)return {ok:false,http:503,category:'UNAVAILABLE',error:'provider_rights_configuration_incomplete'};
  const n=Date.now(),e=Date.parse(effective),x=Date.parse(expires);if(!(e<=n&&n<x&&e<x))return {ok:false,http:403,category:'ENTITLEMENT_DENIED',error:n<e?'provider_rights_not_yet_effective':'provider_rights_expired'};
  if(!allowed.has(marketClass))return {ok:false,http:403,category:'ENTITLEMENT_DENIED',error:'provider_market_class_not_authorized'};
  const attrText=attrRequired?txt(env.TWELVE_DATA_ATTRIBUTION_TEXT,160):null,attrUrl=attrRequired?txt(env.TWELVE_DATA_ATTRIBUTION_URL,256):null;
  if(attrRequired&&(!attrText||!/^https:\/\//i.test(attrUrl)))return {ok:false,http:503,category:'UNAVAILABLE',error:'provider_attribution_configuration_incomplete'};
  const rights_reference_hash=await sha256(ref);
  const rights={schema:'musitu.fmi.provider-rights.v1',provider:PROVIDER,rights_reference_hash,license_authorized:true,redistribution_authorized:true,external_api_authorized:true,market_class:marketClass,max_retention_seconds:retention,effective_at:effective,expires_at:expires,attribution:{required:attrRequired,text:attrRequired?attrText:null,url:attrRequired?attrUrl:null},raw_provider_data_persisted:false};
  return {ok:true,rights,rights_hash:await sha256(rights)};
}
async function snapshot(req,env){
  if(req.headers.get('authorization')||req.headers.get('x-fmi-customer-id'))return out(400,{ok:false,provider:PROVIDER,category:'INTEGRITY_FAILURE',error:'customer_identity_header_forbidden'});
  const u=new URL(req.url),info=pairInfo(u.searchParams.get('symbol')),horizon=txt(u.searchParams.get('horizon')||'NEXT_4H',32).toUpperCase(),interval=intervalFor(horizon);
  if(!info)return out(404,{ok:false,provider:PROVIDER,category:'NOT_SUPPORTED',error:'provider_symbol_not_verified'});
  if(!interval)return out(404,{ok:false,provider:PROVIDER,category:'NOT_SUPPORTED',error:'provider_horizon_not_supported'});
  const rightsGate=await rightsProfile(env,info.market_class);if(!rightsGate.ok)return out(rightsGate.http,{ok:false,provider:PROVIDER,category:rightsGate.category,error:rightsGate.error});
  const apiKey=String(env.TWELVE_DATA_API_KEY||''),entitlement=txt(env.TWELVE_DATA_ENTITLEMENT_LABEL,96),freshness=txt(env.TWELVE_DATA_FRESHNESS_LABEL,24).toUpperCase();
  if(!apiKey||!entitlement||!freshness)return out(503,{ok:false,provider:PROVIDER,category:'UNAVAILABLE',error:'provider_private_configuration_incomplete'});
  const requested=Number(u.searchParams.get('max_observations')||256);if(!Number.isInteger(requested)||requested<5||requested>2048)return out(400,{ok:false,provider:PROVIDER,category:'INTEGRITY_FAILURE',error:'invalid_max_observations'});
  const upstream=new URL(BASE+'/time_series');upstream.searchParams.set('symbol',info.symbol);upstream.searchParams.set('interval',interval);upstream.searchParams.set('outputsize',String(Math.min(requested+1,2049)));upstream.searchParams.set('order','asc');upstream.searchParams.set('timezone','UTC');upstream.searchParams.set('adjust','splits');upstream.searchParams.set('format','JSON');
  const headers=new Headers({'accept':'application/json','authorization':'apikey '+apiKey,'user-agent':'MUSITU-FMI-MarketDataAdapter/1.1'});
  let res;try{res=await fetch(new Request(upstream.toString(),{method:'GET',headers,redirect:'error'}))}catch{return out(503,{ok:false,provider:PROVIDER,category:'UNAVAILABLE',error:'provider_network_unavailable'})}
  let raw;try{raw=await res.text()}catch{return out(503,{ok:false,provider:PROVIDER,category:'UNAVAILABLE',error:'provider_response_unreadable'})}
  if(raw.length>MAX_BODY)return out(502,{ok:false,provider:PROVIDER,category:'INTEGRITY_FAILURE',error:'provider_response_too_large'});
  let body;try{body=JSON.parse(raw||'{}')}catch{return out(502,{ok:false,provider:PROVIDER,category:'INTEGRITY_FAILURE',error:'provider_invalid_json'})}
  if(!res.ok||body?.status==='error'){const e=classifyProviderError(res.status,body);return out(e.http,{ok:false,provider:PROVIDER,category:e.category,error:e.error})}
  if(body?.status!=='ok'||!body?.meta||!Array.isArray(body?.values))return out(502,{ok:false,provider:PROVIDER,category:'INTEGRITY_FAILURE',error:'provider_response_shape_invalid'});
  const metaSymbol=txt(body.meta.symbol,64).toUpperCase();if(metaSymbol!==info.symbol.toUpperCase())return out(502,{ok:false,provider:PROVIDER,category:'INTEGRITY_FAILURE',error:'provider_symbol_mismatch'});
  const instrumentType=safeInstrumentType(body.meta.type);if(!instrumentType)return out(502,{ok:false,provider:PROVIDER,category:'INTEGRITY_FAILURE',error:'provider_instrument_type_invalid'});
  const bars=[];let lastMs=-Infinity;for(const row of body.values){const timestamp=utcTimestamp(row?.datetime),close=Number(row?.close);if(!timestamp||!Number.isFinite(close)||close<=0)return out(502,{ok:false,provider:PROVIDER,category:'INTEGRITY_FAILURE',error:'provider_bar_invalid'});const ms=Date.parse(timestamp);if(ms<=lastMs)return out(502,{ok:false,provider:PROVIDER,category:'INTEGRITY_FAILURE',error:'provider_bar_order_invalid'});lastMs=ms;bars.push({timestamp,close})}
  if(bars.length<6||bars.length>requested+1)return out(502,{ok:false,provider:PROVIDER,category:'INTEGRITY_FAILURE',error:'provider_bar_count_invalid'});
  const fetchedAt=new Date().toISOString(),observedAt=bars.at(-1).timestamp;
  const sourceFacts={schema:'musitu.fmi.twelve-data-adapter.source-facts.v2',provider:PROVIDER,provider_symbol:info.symbol,canonical_symbol:info.canonical,horizon,rights: rightsGate.rights,rights_hash:rightsGate.rights_hash,request:{endpoint:'/time_series',interval,outputsize:Math.min(requested+1,2049),order:'asc',timezone:'UTC',adjust:'splits',format:'JSON'},meta:{symbol:body.meta.symbol,interval:body.meta.interval||interval,currency:body.meta.currency??null,exchange_timezone:body.meta.exchange_timezone??null,exchange:body.meta.exchange??null,mic_code:body.meta.mic_code??null,type:body.meta.type},bars};
  const sourceHash=await sha256(sourceFacts);
  return out(200,{ok:true,provider:PROVIDER,provider_symbol:info.symbol,instrument_type:instrumentType,entitlement,entitled:true,observed_at:observedAt,fetched_at:fetchedAt,freshness,provider_health:'HEALTHY',bars,source_hash:sourceHash,rights:rightsGate.rights,rights_hash:rightsGate.rights_hash,adapter:{schema:'musitu.fmi.twelve-data-adapter.v1',interval,timezone:'UTC',order:'asc',adjust:'splits',credential_transport:'AUTHORIZATION_HEADER',api_key_exposed:false,rights_enforcement:'DENY_BY_DEFAULT_V1'},authority:{market_context_only:true,live_trading:false,trade_execution:false}});
}
function health(env){return out(200,{ok:true,status:'ok',service:'MUSITU_FMI_TWELVE_DATA_ADAPTER',provider:PROVIDER,license_authorized:String(env.TWELVE_DATA_LICENSE_AUTHORIZED||'').toLowerCase()==='true',redistribution_authorized:String(env.TWELVE_DATA_REDISTRIBUTION_AUTHORIZED||'').toLowerCase()==='true',external_api_authorized:String(env.TWELVE_DATA_EXTERNAL_API_AUTHORIZED||'').toLowerCase()==='true',api_key_configured:!!env.TWELVE_DATA_API_KEY,entitlement_configured:!!env.TWELVE_DATA_ENTITLEMENT_LABEL,rights_reference_configured:!!env.TWELVE_DATA_RIGHTS_REFERENCE,public_exposure_required:false,authority:'MARKET_CONTEXT_ONLY',live_trading:false,trade_execution:false})}
export default {async fetch(req,env){const u=new URL(req.url);if(req.method==='GET'&&u.pathname==='/healthz')return health(env);if(req.method==='GET'&&u.pathname==='/v1/snapshot')return snapshot(req,env);return out(404,{ok:false,error:'not_found'})}};
