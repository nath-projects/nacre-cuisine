import {createHash,randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {env} from 'cloudflare:workers';
import {fail} from './http';
export type Account={id:string;username:string};
export const database=()=>{const db=(env as unknown as {DB?:D1Database}).DB;if(!db)fail('Le stockage est momentanément indisponible.',503);return db};
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const randomToken=()=>randomBytes(32).toString('base64url');
export const loginName=(value:unknown)=>typeof value==='string'?value.trim().toLowerCase():'';
export function checkUsername(value:unknown){const name=loginName(value);if(!/^[a-z0-9][a-z0-9_.-]{2,29}$/.test(name))fail('Identifiant : 3 à 30 lettres minuscules, chiffres, points, tirets ou underscores.');return name}
export function checkPassword(value:unknown){if(typeof value!=='string'||value.length<12||value.length>128||Buffer.byteLength(value)>512)fail('Utilisez un mot de passe de 12 à 128 caractères.');return value}
const params={N:32768,r:8,p:3,maxmem:64*1024*1024};
const derive=(password:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,32,params,(e,key)=>e?reject(e):resolve(key)));
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');const key=await derive(password,salt);return `scrypt-v1$${salt}$${key.toString('hex')}`}
export async function verifyPassword(password:string,stored:string){const [version,salt,hex]=stored.split('$');if(version!=='scrypt-v1'||!/^[a-f0-9]{32}$/.test(salt||'')||!/^[a-f0-9]{64}$/.test(hex||''))return false;return timingSafeEqual(await derive(password,salt),Buffer.from(hex,'hex'))}
function cookieName(req:Request){return new URL(req.url).protocol==='https:'?'__Host-nacre_session':'nacre_dev_session'}
export function readToken(req:Request){const name=cookieName(req);const values=(req.headers.get('cookie')||'').split(';').map(x=>x.trim());const token=values.find(x=>x.startsWith(name+'='))?.slice(name.length+1);return token&&/^[A-Za-z0-9_-]{43}$/.test(token)?token:null}
export function sessionCookie(req:Request,token:string,age=60*60*24*14){return `${cookieName(req)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(req.url).protocol==='https:'?'; Secure':''}`}
export async function currentAccount(req:Request):Promise<Account|null>{const token=readToken(req);if(!token)return null;return database().prepare('SELECT a.id,a.username FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires>? AND s.auth_version=a.auth_version').bind(digest(token),Date.now()).first<Account>()}
export async function requireAccount(req:Request){const a=await currentAccount(req);if(!a)fail('Connectez-vous à votre compte Nacre.',401);return a}
export async function newSession(req:Request,id:string,version?:number){const db=database();const current=await db.prepare('SELECT auth_version FROM accounts WHERE id=?').bind(id).first<{auth_version:number}>();if(!current)fail('Compte introuvable.',401);const authVersion=version??current.auth_version;const token=randomToken(),now=Date.now();await database().batch([database().prepare('DELETE FROM sessions WHERE expires<?').bind(now),database().prepare('INSERT INTO sessions(token_hash,account_id,expires,created,auth_version) VALUES(?,?,?,?,?)').bind(digest(token),id,now+14*86400000,now,authVersion)]);return sessionCookie(req,token)}
// Atomic, database-backed limits survive isolate restarts. Only the trusted
// Cloudflare address is used; arbitrary forwarding headers are not accepted.
export async function throttle(req:Request,scope:string,limit:number,windowMs:number,subject=''){
 const now=Date.now(),bucket=Math.floor(now/windowMs),ip=req.headers.get('cf-connecting-ip')||'local';
 const key=digest(scope+':'+ip+':'+subject+':'+bucket);
 const row=await database().prepare('INSERT INTO auth_limits(id,count,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(key,(bucket+2)*windowMs,limit).first();
 if(!row)fail('Trop de tentatives. Patientez avant de réessayer.',429);
 await database().prepare('DELETE FROM auth_limits WHERE expires<?').bind(now).run();
}
