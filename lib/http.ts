export function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status})}
export function json(data:unknown,status=200,headers:HeadersInit={}){return Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}})}
export async function bodyJSON(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site')fail('Origine non autorisée.',403);
 if(!req.headers.get('content-type')?.startsWith('application/json'))fail('Format non autorisé.',415);
 if(Number(req.headers.get('content-length')||0)>50000)fail('Contenu trop volumineux.',413);
 const raw=await req.text();if(raw.length>50000)fail('Contenu trop volumineux.',413);
 try{const body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))fail('Requête invalide.');return body}catch{fail('Requête invalide.')}
}
export function errorResponse(error:unknown){const e=error as Error&{status?:number};return json({error:e.status?e.message:'Une erreur est survenue. Réessayez dans un instant.'},e.status||500)}
