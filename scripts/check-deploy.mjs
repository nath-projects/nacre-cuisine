import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
if(config.d1_databases[0].database_id==='00000000-0000-4000-8000-000000000000'){console.error('Créez votre base D1 et renseignez database_id dans wrangler.jsonc avant de publier.');process.exit(1)}
