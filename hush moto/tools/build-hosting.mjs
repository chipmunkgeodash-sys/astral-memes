import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const output='hosting-dist';
const models=[['jacobdesigns','crf450.glb'],['how2random','lbx.glb'],['files3d','ultra.glb'],['stark','stark.glb'],['ktm','duke.glb'],['duhgless','bike3.glb']];
await fs.mkdir(`${output}/dist`,{recursive:true});
await esbuild.build({entryPoints:['src/main.js'],bundle:true,outfile:`${output}/dist/game.js`,format:'iife',
  target:['es2022'],minify:true,legalComments:'none',alias:{'three/addons':'three/examples/jsm'},
  define:{HUSH_MULTIPLAYER_URL:JSON.stringify(process.env.HUSH_MULTIPLAYER_URL || '')}});
let html=await fs.readFile('index.html','utf8');
const version = createHash('sha256').update(await fs.readFile(`${output}/dist/game.js`)).digest('hex').slice(0, 12);
html = html.replace('src="dist/game.js"', `src="dist/game.js?v=${version}"`);
html=html.replace('<button class="btn" id="btn-settings">Settings</button>',
  '<button class="btn" id="btn-settings">Settings</button><a href="credits.html" target="_blank" rel="noopener" style="color:#b5c6d8;padding:8px">Model credits</a>');
await fs.writeFile(`${output}/index.html`,html);
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const credits=[];
for(const [creator,file] of models){
  const from=`assets/bikes/${creator}`,to=`${output}/${from}`;
  await fs.mkdir(to,{recursive:true});
  await fs.copyFile(`${from}/${file}`,`${to}/${file}`);
  await fs.copyFile(`${from}/LICENSE.md`,`${to}/LICENSE.md`);
  credits.push(`<pre>${escape(await fs.readFile(`${from}/LICENSE.md`,'utf8'))}</pre>`);
}
await fs.writeFile(`${output}/credits.html`, `<!doctype html><meta charset="utf-8"><title>Hush Moto — Model credits</title><style>body{max-width:900px;margin:40px auto;padding:20px;background:#101820;color:#e7eef4;font:16px system-ui}pre{white-space:pre-wrap;font:inherit;line-height:1.6;padding:20px;background:#18232d}a{color:#7bddaa}</style><a href="index.html">Back to Hush Moto</a><h1>Model credits</h1><p>Light Bee X, Ultra Bee, Honda, Stark, KTM and the Custom Bobber include imported models. R1 uses built-in geometry. Optional personal replacements can be selected in the garage. Creator attributions and source license notes are reproduced below.</p>${credits.join('')}`);
// Publish only the explicitly listed game assets, never source archives.
const allowed=new Set(['index.html','credits.html','dist/game.js',...models.flatMap(([c,f])=>[`assets/bikes/${c}/${f}`,`assets/bikes/${c}/LICENSE.md`])]);
async function verify(dir,relative=''){
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    const name=relative+entry.name;
    if(entry.isSymbolicLink())throw Error(`Unexpected symlink: ${name}`);
    if(entry.isDirectory())await verify(path.join(dir,entry.name),name+'/');
    else if(!allowed.has(name))throw Error(`Unexpected public file: ${name}`);
  }
}
await verify(output);
console.log(`Prepared ${allowed.size} public files with creator credits. LBX and Ultra Bee models included.`);
