import {bodyJSON,json,fail,errorResponse} from '@/lib/http';
import {database,requireAccount,checkUsername,digest,randomToken,throttle} from '@/lib/session';
import {seeds} from '@/lib/seeds';
export const dynamic='force-dynamic';
type Family={id:string;name:string;owner:string;created:number};
async function familyFor(uid:string){return database().prepare('SELECT f.* FROM families f JOIN family_members m ON m.family_id=f.id WHERE m.user_id=?').bind(uid).first<Family>()}
export async function GET(req:Request){try{
 const a=await requireAccount(req),db=database(),family=await familyFor(a.id),now=Date.now();
 const pending=(await db.prepare('SELECT i.id,i.expires,f.name familyName,p.name invitedBy FROM family_invites i JOIN families f ON f.id=i.family_id JOIN profiles p ON p.id=f.owner WHERE i.target_id=? AND i.used_by IS NULL AND i.expires>?').bind(a.id,now).all()).results;
 if(!family)return json({family:null,pending});
 const members=(await db.prepare('SELECT a.id,a.username,p.name,p.color,m.joined FROM family_members m JOIN accounts a ON a.id=m.user_id JOIN profiles p ON p.id=a.id WHERE m.family_id=? ORDER BY m.joined').bind(family.id).all()).results;
 const recipeIds=(await db.prepare('SELECT recipe_id FROM family_recipes WHERE family_id=? ORDER BY created DESC').bind(family.id).all<{recipe_id:string}>()).results.map(x=>x.recipe_id);
 const invites=family.owner===a.id?(await db.prepare('SELECT i.id,i.expires,a.username target FROM family_invites i LEFT JOIN accounts a ON a.id=i.target_id WHERE i.family_id=? AND i.used_by IS NULL AND i.expires>? ORDER BY i.created DESC').bind(family.id,now).all()).results:[];
 return json({family:{...family,members,recipeIds,invites,isOwner:family.owner===a.id},pending});
}catch(e){return errorResponse(e)}}
export async function POST(req:Request){try{
 const b=await bodyJSON(req),a=await requireAccount(req),db=database(),now=Date.now();let family=await familyFor(a.id);
 if(b.action==='create'){
  if(family)fail('Vous faites déjà partie d’une famille.',409);const name=typeof b.name==='string'?b.name.trim():'';if(name.length<2||name.length>60)fail('Le nom doit comporter 2 à 60 caractères.');
  await throttle(req,'family-create',5,3600000,a.id);const id=crypto.randomUUID();
  await db.batch([db.prepare('INSERT INTO families(id,name,owner,created) VALUES(?,?,?,?)').bind(id,name,a.id,now),db.prepare('INSERT INTO family_members(user_id,family_id,joined) VALUES(?,?,?)').bind(a.id,id,now)]);return json({id},201);
 }
 if(b.action==='join'||b.action==='accept'){
  if(family)fail('Quittez votre famille actuelle avant d’en rejoindre une autre.',409);await throttle(req,'family-join',12,900000,a.id);
  const code=typeof b.code==='string'?b.code.trim():'';
  const invite=await db.prepare(b.action==='join'?'SELECT * FROM family_invites WHERE code_hash=? AND used_by IS NULL AND expires>?':'SELECT * FROM family_invites WHERE id=? AND target_id=? AND used_by IS NULL AND expires>?').bind(...(b.action==='join'?[digest(code),now]:[String(b.inviteId||''),a.id,now])).first<{id:string;family_id:string;target_id:string|null}>();
  if(!invite||(invite.target_id&&invite.target_id!==a.id))fail('Invitation invalide, expirée ou réservée à un autre compte.',404);
  // Both statements are one transaction; a code can admit exactly one member.
  const result=await db.batch([db.prepare('INSERT INTO family_members(user_id,family_id,joined) SELECT ?,family_id,? FROM family_invites WHERE id=? AND used_by IS NULL AND expires>? AND (target_id IS NULL OR target_id=?) RETURNING family_id').bind(a.id,now,invite.id,now,a.id),db.prepare('UPDATE family_invites SET used_by=? WHERE id=? AND used_by IS NULL AND EXISTS(SELECT 1 FROM family_members WHERE user_id=? AND family_id=family_invites.family_id)').bind(a.id,invite.id,a.id)]);
  if(!result[0].results?.length)fail('Cette invitation a déjà été utilisée.',409);return json({ok:true});
 }
 if(b.action==='decline'){await db.prepare('DELETE FROM family_invites WHERE id=? AND target_id=?').bind(String(b.inviteId||''),a.id).run();return json({ok:true})}
 if(!family)fail('Créez ou rejoignez une famille.',404);
 if(b.action==='leave'){if(family.owner===a.id)fail('Transmettez le rôle de responsable avant de quitter la famille.');await db.prepare('DELETE FROM family_members WHERE user_id=? AND family_id=?').bind(a.id,family.id).run();return json({ok:true})}
 if(b.action==='recipe'){
  const rid=String(b.recipeId||'');if(!seeds.some(r=>r.id===rid)&&!await db.prepare('SELECT id FROM recipes WHERE id=?').bind(rid).first())fail('Recette introuvable.',404);
  await db.prepare(b.remove?'DELETE FROM family_recipes WHERE family_id=? AND recipe_id=?':'INSERT OR IGNORE INTO family_recipes(family_id,recipe_id,added_by,created) VALUES(?,?,?,?)').bind(...(b.remove?[family.id,rid]:[family.id,rid,a.id,now])).run();return json({ok:true});
 }
 if(family.owner!==a.id)fail('Cette action est réservée au responsable de la famille.',403);
 if(b.action==='invite'){
  await throttle(req,'family-invite',20,3600000,a.id);let target:string|null=null;
  if(b.username){const username=checkUsername(b.username);const user=await db.prepare('SELECT id FROM accounts WHERE username=?').bind(username).first<{id:string}>();if(!user)fail('Compte introuvable. Votre proche peut créer son compte, ou vous pouvez lui donner un code.');if(await familyFor(user.id))fail('Ce compte appartient déjà à une famille.');target=user.id}
  const code=randomToken(),id=crypto.randomUUID(),expires=now+72*3600000;
  await db.prepare('INSERT INTO family_invites(id,family_id,code_hash,target_id,created,expires) VALUES(?,?,?,?,?,?)').bind(id,family.id,digest(code),target,now,expires).run();return json({id,code,expires},201);
 }
 if(b.action==='revoke'){await db.prepare('DELETE FROM family_invites WHERE id=? AND family_id=?').bind(String(b.inviteId||''),family.id).run();return json({ok:true})}
 if(b.action==='remove'||b.action==='transfer'){
  const uid=String(b.userId||'');if(uid===a.id)fail('Choisissez un autre membre.');if(!await db.prepare('SELECT user_id FROM family_members WHERE user_id=? AND family_id=?').bind(uid,family.id).first())fail('Membre introuvable.',404);
  if(b.action==='remove')await db.prepare('DELETE FROM family_members WHERE user_id=? AND family_id=?').bind(uid,family.id).run();else await db.prepare('UPDATE families SET owner=? WHERE id=? AND owner=?').bind(uid,family.id,a.id).run();return json({ok:true});
 }
 if(b.action==='rename'){const name=typeof b.name==='string'?b.name.trim():'';if(name.length<2||name.length>60)fail('Le nom doit comporter 2 à 60 caractères.');await db.prepare('UPDATE families SET name=? WHERE id=? AND owner=?').bind(name,family.id,a.id).run();return json({ok:true})}
 fail('Action inconnue.');
}catch(e){return errorResponse(e)}}
