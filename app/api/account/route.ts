import {bodyJSON,json,fail,errorResponse} from '@/lib/http';
import {database,currentAccount,requireAccount,checkUsername,checkPassword,hashPassword,verifyPassword,newSession,readToken,digest,randomToken,sessionCookie,throttle,loginName} from '@/lib/session';
import {legacyIdentity} from '@/lib/legacy-identity';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{return json({account:await currentAccount(req)})}catch(e){return errorResponse(e)}}
export async function POST(req:Request){try{
 const b=await bodyJSON(req),db=database();
 if(b.action==='logout'){const t=readToken(req);if(t)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(digest(t)).run();return json({ok:true},200,{'Set-Cookie':sessionCookie(req,'',0)})}
 if(b.action==='register'){
  await throttle(req,'register',5,3600000);const username=checkUsername(b.username),password=checkPassword(b.password);
  const name=typeof b.name==='string'?b.name.trim():'';if(name.length<2||name.length>30)fail('Le pseudo public doit comporter 2 à 30 caractères.');
  const color=typeof b.color==='string'&&/^#[a-f0-9]{6}$/i.test(b.color)?b.color:'#65745f';
  if(await db.prepare('SELECT id FROM accounts WHERE username=?').bind(username).first())fail('Cet identifiant est indisponible.',409);
  const legacy=await legacyIdentity();const previous=legacy?await db.prepare('SELECT id FROM profiles WHERE id=? AND NOT EXISTS(SELECT 1 FROM accounts WHERE id=?)').bind(legacy,legacy).first<{id:string}>():null;
  const id=previous?.id||crypto.randomUUID(),passwordHash=await hashPassword(password),recovery=randomToken();
  try{await db.batch([db.prepare('INSERT INTO accounts(id,username,password_hash,recovery_hash,created) VALUES(?,?,?,?,?)').bind(id,username,passwordHash,digest(recovery),Date.now()),db.prepare('INSERT INTO profiles(id,name,color) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color').bind(id,name,color)])}catch{fail('Cet identifiant est indisponible. Réessayez.',409)}
  return json({ok:true,recoveryCode:recovery},201,{'Set-Cookie':await newSession(req,id)});
 }
 if(b.action==='login'){
  const username=loginName(b.username);if(typeof b.password!=='string'||b.password.length>128)fail('Identifiant ou mot de passe incorrect.',401);
  await throttle(req,'login-ip',35,900000);await throttle(req,'login-user',8,900000,username);
  const a=await db.prepare('SELECT id,password_hash,auth_version FROM accounts WHERE username=?').bind(username).first<{id:string;password_hash:string;auth_version:number}>();
  // Same expensive operation for unknown names; no account-enumeration shortcut.
  const dummy='scrypt-v1$0123456789abcdef0123456789abcdef$'+('00'.repeat(32));
  const valid=await verifyPassword(b.password,a?.password_hash||dummy);if(!a||!valid)fail('Identifiant ou mot de passe incorrect.',401);
  return json({ok:true},200,{'Set-Cookie':await newSession(req,a.id,a.auth_version)});
 }
 if(b.action==='recover'){
  const username=loginName(b.username);await throttle(req,'recover',5,3600000);const password=checkPassword(b.password);
  const code=typeof b.recoveryCode==='string'?b.recoveryCode.trim():'';if(!/^[A-Za-z0-9_-]{43}$/.test(code))fail('Identifiant ou code de récupération incorrect.',401);
  const a=await db.prepare('SELECT id FROM accounts WHERE username=? AND recovery_hash=?').bind(username,digest(code)).first<{id:string}>();if(!a)fail('Identifiant ou code de récupération incorrect.',401);
  const hash=await hashPassword(password),recovery=randomToken();
  // Compare-and-swap makes the recovery code single-use, even under concurrency.
  const result=await db.prepare('UPDATE accounts SET auth_version=auth_version+1,password_hash=?,recovery_hash=? WHERE id=? AND recovery_hash=? RETURNING id').bind(hash,digest(recovery),a.id,digest(code)).first();if(!result)fail('Ce code a déjà été utilisé.',409);
  await db.prepare('DELETE FROM sessions WHERE account_id=?').bind(a.id).run();
  return json({ok:true,recoveryCode:recovery},200,{'Set-Cookie':sessionCookie(req,'',0)});
 }
 if(b.action==='password'){
  const a=await requireAccount(req);await throttle(req,'password',5,900000,a.id);const password=checkPassword(b.password);
  if(typeof b.currentPassword!=='string'||b.currentPassword.length>128)fail('Mot de passe actuel incorrect.',401);
  const account=await db.prepare('SELECT password_hash FROM accounts WHERE id=?').bind(a.id).first<{password_hash:string}>();if(!account||!await verifyPassword(b.currentPassword,account.password_hash))fail('Mot de passe actuel incorrect.',401);
  const hash=await hashPassword(password);await db.batch([db.prepare('UPDATE accounts SET auth_version=auth_version+1,password_hash=? WHERE id=?').bind(hash,a.id),db.prepare('DELETE FROM sessions WHERE account_id=?').bind(a.id)]);
  return json({ok:true},200,{'Set-Cookie':await newSession(req,a.id)});
 }
 fail('Action inconnue.');
}catch(e){return errorResponse(e)}}
