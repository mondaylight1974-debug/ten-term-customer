const fs=require('fs'),path=require('path');
const AdmZip=require('adm-zip');
const zipPath=path.join(__dirname,'..','Ten-Term-Customer-Admin-Corrected.zip');
if(!fs.existsSync(zipPath)) throw new Error('The Ten Term application archive is missing from the repository.');
const zip=new AdmZip(zipPath);
zip.extractAllTo(path.join(__dirname,'..'),true);
console.log('Customer and admin portal assets prepared.');
