// Execute the actual route handlers against an in-memory SQLite D1 adapter.
// Authentication and provider responses are fixtures; no live keys or network calls.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),dir=resolve('.sites-runtime/tests');await mkdir(dir,{recursive:true});
const sql=new DatabaseSync(':memory:');for(const file of (await readdir('drizzle')).filter(x=>x.endsWith('.sql')).sort())sql.exec(await readFile('drizzle/'+file,'utf8'));
class Statement{constructor(query,args=[]){this.query=query;this.args=args}bind(...args){return new Statement(this.query,args)}async first(){return sql.prepare(this.query).get(...this.args)||null}async all(){return {results:sql.prepare(this.query).all(...this.args)}}async run(){return sql.prepare(this.query).run(...this.args)}}
const db={prepare:q=>new Statement(q),batch:async list=>{sql.exec('BEGIN');try{const out=[];for(const s of list)out.push(await s.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
globalThis.__nacre={env:{DB:db},user:null};
async function compile(from,to,transform=x=>x){const source=transform(await readFile(from,'utf8'));const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;await writeFile(resolve(dir,to),output)}
await compile('lib/recipe.ts','recipe.mjs',s=>s.replace("from 'zod'","from '"+pathToFileURL(require.resolve('zod')).href+"'"));
await compile('lib/seeds.ts','seeds.mjs',s=>s.replace("from './recipe'","from './recipe.mjs'"));
await compile('app/api/nacre/route.ts','route.mjs',s=>s.replace("import {env} from 'cloudflare:workers';","const env=globalThis.__nacre.env;").replace("import {currentAccount} from '@/lib/session';","const currentAccount=async()=>globalThis.__nacre.user;").replace("from '@/lib/recipe'","from './recipe.mjs'").replace("from '@/lib/seeds'","from './seeds.mjs'"));
const {GET,POST}=await import(pathToFileURL(resolve(dir,'route.mjs')).href);
let checks=0;function check(condition,label){assert.ok(condition,label);console.log('PASS',label);checks++}
async function call(body=null,user=null,origin='https://nacre.test'){globalThis.__nacre.user=user?{id:user,username:user}:null;const r=body?await POST(new Request('https://nacre.test/api/nacre',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})):await GET(new Request('https://nacre.test/api/nacre'));return {status:r.status,data:await r.json()}}
const a='user-a',b='user-b';let r=await call();check(r.status===200&&r.data.recipes.length===3,'catalogue exposes editorial seeds without fake community authors');const recipe=r.data.recipes[0];
check((await call({action:'book',name:'x'})).status===401,'anonymous write rejected');
check((await call({action:'profile',name:'Alice'},a,'https://evil.test')).status===403,'cross-origin write rejected');
for(const [uid,name] of [[a,'Alice'],[b,'Bob']])check((await call({action:'profile',name,color:'#617e94'},uid)).status===200,'public profile saved');
r=await call({action:'publish',recipe:{...recipe,title:'Ma recette'}},a);check(r.status===200,'complete manual recipe publishes');const rid=r.data.id;
check((await call({action:'update',recipeId:rid,recipe:{...recipe,title:'Recette corrigée'}},b)).status===404,'another account cannot edit recipe');
check((await call({action:'update',recipeId:rid,recipe:{...recipe,title:'Recette corrigée'}},a)).status===200,'author can edit recipe without changing identity');
r=await call(null,b);check(r.data.recipes.some(x=>x.id===rid&&x.author==='Alice'&&x.color==='#617e94'),'community recipe exposes creator name and color');
r=await call({action:'book',name:'Mes recettes',color:'#65745f'},a);const bid=r.data.id;check(r.status===200,'private notebook created');
check((await call({action:'entry',bookId:bid,recipeId:rid},a)).status===200,'recipe added to notebook');
check((await call({action:'entry',bookId:bid,recipeId:rid},a)).status===200,'adding twice is idempotent');
check((await call({action:'entry',bookId:bid,recipeId:rid},b)).status===404,'another account cannot modify notebook');
check((await call({action:'deleteBook',bookId:bid},b)).status===404,'another account cannot delete notebook');
check((await call({action:'deleteRecipe',recipeId:rid},b)).status===404,'another account cannot delete recipe');
check((await call({action:'note',recipeId:rid,text:'Mon secret',cooked:true},a)).status===200,'private note and cooked status saved');
r=await call(null,a);check(r.data.books[0].recipeIds.length===1&&r.data.notes[0].text==='Mon secret','owner can read their saved data');
r=await call(null,b);check(r.data.books.length===0&&r.data.notes.length===0,'private data isolated across accounts');
check((await call({action:'publish',recipe:{title:'Incomplete'}},a)).status===400,'incomplete recipe never published');
check((await call({action:'generate',prompt:'Un plat végétarien pour deux'},a)).status===503,'missing provider credentials reported honestly');
check((await call({action:'report',recipeId:rid,reason:'Ingrédient à vérifier'},b)).status===200,'community report saved');
const realFetch=globalThis.fetch;let calls=[];globalThis.__nacre.env.GEMINI_API_KEY='fixture';globalThis.__nacre.env.GROQ_API_KEY='fixture';
globalThis.fetch=async url=>{calls.push(url);if(String(url).includes('googleapis'))return new Response('rate limited',{status:429});return Response.json({choices:[{message:{content:JSON.stringify(recipe)}}]})};
r=await call({action:'generate',provider:'google',prompt:'Des pâtes pour deux personnes'},a);check(r.status===200&&calls.length===2,'provider quota failure falls back to second provider');
const generated=r.data.id;r=await call(null,b);check(r.data.recipes.some(x=>x.id===generated&&x.source==='ai:groq'),'generated recipe automatically published and attributed');
const before=r.data.recipes.length;globalThis.fetch=async()=>Response.json({choices:[{message:{content:'{"title":"invalid"}'}}]});r=await call({action:'generate',provider:'groq',prompt:'Un dîner rapide pour deux'},a);check(r.status===502,'invalid AI recipe rejected');r=await call();check(r.data.recipes.length===before,'failed generation publishes nothing');
const day=new Date().toISOString().slice(0,10);sql.prepare('UPDATE usage SET count=20 WHERE id=?').run(a+':'+day);check((await call({action:'generate',prompt:'Des pâtes pour deux personnes'},a)).status===429,'daily generation quota enforced');globalThis.fetch=realFetch;
check((await call({action:'deleteRecipe',recipeId:rid},a)).status===200,'owner may remove publication');r=await call(null,a);check(!r.data.books[0].recipeIds.includes(rid)&&!r.data.notes.some(x=>x.recipeId===rid),'removal cleans notebook entries and notes');
check((await call({action:'deleteBook',bookId:bid},a)).status===200,'owner can delete notebook');
sql.close();console.log(`${checks} server checks passed.`);
