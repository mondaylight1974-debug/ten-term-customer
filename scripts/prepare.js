'use strict';
const fs=require('fs');
const path=require('path');
const AdmZip=require('adm-zip');

const root=path.resolve(__dirname,'..');
const publicDir=path.join(root,'public');
const zipPath=path.join(root,'Ten-Term-Customer-Admin-Corrected.zip');

// Render's Docker build already extracts the archive into /app/public.
// For local runs, prepare the archive only when that folder is absent.
if(!fs.existsSync(publicDir)){
  if(!fs.existsSync(zipPath)) throw new Error('The Ten Term application archive is missing from the repository.');
  new AdmZip(zipPath).extractAllTo(root,true);
}
if(!fs.existsSync(publicDir)) throw new Error('The customer/admin public assets could not be prepared.');

// The maintained root files are the current customer portal. Overlay them
// after archive extraction so the live site never serves the stale ZIP copy.
fs.mkdirSync(publicDir,{recursive:true});
for(const file of ['index.html','app.js','style.css','admin.html']){
  const source=path.join(root,file);
  if(!fs.existsSync(source)) throw new Error('Required current frontend file is missing: '+file);
  fs.copyFileSync(source,path.join(publicDir,file));
}
console.log('Ten Term portal assets prepared from the latest maintained files.');
