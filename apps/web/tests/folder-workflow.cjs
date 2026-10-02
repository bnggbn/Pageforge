const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {chromium}=require('playwright');
const {createLibraryServer}=require('../../../scripts/library-server.cjs');
process.chdir(path.resolve(__dirname,'../../..'));
require('./fixtures.cjs');
(async()=>{
  const libraryRoot=path.resolve('.preview/folder-tests',randomUUID());
  fs.mkdirSync(path.join(libraryRoot,'collection'),{recursive:true});
  for(const name of ['閱讀測試.md','純文字.txt'])fs.copyFileSync(path.join('.preview/fixtures',name),path.join(libraryRoot,'collection',name));
  let server=createLibraryServer({libraryRoot});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port,url=`http://127.0.0.1:${port}`;
  const browser=await chromium.launch({channel:process.env.PAGEFORGE_BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const api=async(route,method='GET',data)=>{const response=await fetch(url+'/api/library'+route,{method,...(data===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})});return{status:response.status,value:await response.json()}};
    const waitReader=async p=>{await p.waitForURL(/reader/);await p.getByRole('button',{name:'版本紀錄',exact:true}).waitFor()};
    await page.goto(url);await page.waitForFunction(()=>document.querySelectorAll('.book-card').length===2);
    assert.equal(await page.getByText('The Creative Act',{exact:true}).count(),0);
    assert.match(await page.locator('.folder-bar').innerText(),/library\//);
    let documents=(await api('/documents')).value;
    assert.equal(documents.length,2);
    const id=documents.find(d=>d.format==='markdown').id,book=path.join(libraryRoot,'books',id);
    assert.ok(fs.existsSync(path.join(book,'original.md')));
    assert.equal(fs.readFileSync(path.join(book,'original.md'),'utf8'),fs.readFileSync('.preview/fixtures/閱讀測試.md','utf8'));
    await page.locator('.book-card').filter({hasText:'閱讀測試'}).click();await waitReader(page);
    await page.getByRole('button',{name:'編輯文字',exact:true}).click();
    const initial=await page.getByLabel('編輯文件文字').inputValue();
    await page.getByLabel('編輯文件文字').fill(initial+'\n\n固定資料夾儲存的修改。\n');
    await page.getByRole('button',{name:'儲存新版本',exact:true}).click();await page.getByText('已保存第 2 版。',{exact:true}).waitFor();
    assert.equal(fs.readdirSync(path.join(book,'versions')).filter(f=>f.endsWith('.json')).length,2);
    assert.equal(fs.readFileSync(path.join(book,'original.md'),'utf8'),initial);
    await page.getByLabel('新增筆記').fill('這則筆記也存在硬碟。');
    await page.getByRole('button',{name:'保存筆記',exact:true}).click();await page.getByText('已保存第 3 版。',{exact:true}).waitFor();
    await page.getByRole('button',{name:'版本紀錄',exact:true}).click();
    await page.getByLabel('比較起始版本').selectOption({label:'第 1 版 · 匯入原始文件'});
    assert.match(await page.locator('.diff-added').innerText(),/固定資料夾/);
    await page.screenshot({path:'.preview/pageforge-folder-history.png',fullPage:true});
    await page.getByRole('button',{name:'閱讀',exact:true}).click();
    await page.locator('.reader-scroll').evaluate(el=>el.scrollTop=el.scrollHeight*.4);await page.waitForTimeout(800);
    assert.ok(JSON.parse(fs.readFileSync(path.join(book,'manifest.json'),'utf8')).progress.percentage>0);
    await context.close();
    // A new browser has no IndexedDB from the first context; the shelf and versions must still load.
    const fresh=await browser.newContext({viewport:{width:1440,height:1000}}),other=await fresh.newPage();
    await other.goto(url);await other.waitForFunction(()=>document.querySelectorAll('.book-card').length===2);
    await other.locator('.book-card').filter({hasText:'閱讀測試'}).click();await waitReader(other);
    assert.equal(await other.locator('.version-badge').innerText(),'第 3 版');
    assert.match(await other.locator('.note-list').innerText(),/存在硬碟/);
    assert.ok(await other.locator('.reader-scroll').evaluate(el=>el.scrollTop>0));
    // Concurrent writers cannot overwrite a newer filesystem manifest.
    const second=await fresh.newPage();await second.goto(other.url());await waitReader(second);
    await second.getByRole('button',{name:'編輯文字',exact:true}).click();await second.getByLabel('編輯文件文字').fill(initial+'\n未保存的 B 文字。');
    await other.getByRole('button',{name:'編輯文字',exact:true}).click();await other.getByLabel('編輯文件文字').fill(initial+'\nA 的新版本。');
    await other.getByRole('button',{name:'儲存新版本',exact:true}).click();await other.getByText('已保存第 4 版。',{exact:true}).waitFor();
    await second.getByRole('button',{name:'儲存新版本',exact:true}).click();await second.locator('.reader-status .error').waitFor();
    assert.match(await second.locator('.reader-status .error').innerText(),/另一個分頁/);
    assert.match(await second.getByLabel('編輯文件文字').inputValue(),/未保存的 B/);await second.close();
    // New files in collection are real files, not UI data constants.
    fs.copyFileSync('.preview/fixtures/章節.epub',path.join(libraryRoot,'collection','章節.epub'));
    fs.copyFileSync('.preview/fixtures/試算表.xlsx',path.join(libraryRoot,'collection','試算表.xlsx'));
    fs.copyFileSync('.preview/fixtures/文件.pdf',path.join(libraryRoot,'collection','文件.pdf'));
    await other.goto(url);await other.getByRole('button',{name:'重新載入資料夾',exact:true}).click();await other.getByText(/資料夾載入完成：新增 3 份/).waitFor();
    documents=(await api('/documents')).value;assert.equal(documents.length,5);
    await other.getByRole('button',{name:'重新載入資料夾',exact:true}).click();await other.getByText(/資料夾載入完成：新增 0 份/).waitFor();
    assert.equal((await api('/documents')).value.length,5);
    await other.screenshot({path:'.preview/pageforge-folder-shelf.png',fullPage:true});
    for(const width of [390,320]){await other.setViewportSize({width,height:900});assert.equal(await other.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
    await other.setViewportSize({width:1440,height:1000});
    // Legacy browser records migrate with complete history, with originals left intact in IndexedDB.
    const template=(await api(`/documents/${id}`)).value;
    const {computeGenesisSAI,computeSAI,marshal,toHex}=require('vax-sdk');
    const crypto=require('node:crypto');
    const legacyId=randomUUID(),salt=crypto.randomBytes(16),actor=`pageforge:${legacyId}`;
    const genesis=toHex(await computeGenesisSAI(actor,salt)),content='舊瀏覽器文件與版本';
    const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),original=Buffer.from(content),createdAt=new Date().toISOString();
    const legacy={...template,id:legacyId,title:'瀏覽器移轉測試',filename:'移轉.txt',format:'text',actor,salt:salt.toString('hex'),genesis,originalHash:sha(original),sections:[],sheets:[],createdAt,updatedAt:createdAt};
    delete legacy.originalBase64;delete legacy.originalType;
    const revisionId=randomUUID();const envelope=marshal({action_type:'pageforge.import',timestamp:Date.parse(createdAt),sdto:{documentId:legacyId,revisionId,parentId:null,originalHash:legacy.originalHash,contentHash:sha(content),notesHash:sha(marshal([])),restoredFrom:null,viewHash:sha(marshal({title:legacy.title,filename:legacy.filename,format:legacy.format,sections:[],sheets:[]}))}}).toString('utf8');
    legacy.revisions=[{id:revisionId,parentId:null,kind:'import',createdAt,content,notes:[],prevSAI:genesis,sai:toHex(await computeSAI(Buffer.from(genesis,'hex'),Buffer.from(envelope))),envelope}];
    await other.evaluate(async({legacy,content})=>{legacy.original=new Blob([content]);const database=await new Promise((resolve,reject)=>{const r=indexedDB.open('pageforge-library');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});await new Promise((resolve,reject)=>{const tx=database.transaction(['documents','summaries'],'readwrite');tx.objectStore('documents').put(legacy);tx.objectStore('summaries').put({id:legacy.id,title:legacy.title,format:legacy.format,originalHash:legacy.originalHash,head:legacy.revisions[0].id});tx.oncomplete=()=>{database.close();resolve()};tx.onerror=()=>reject(tx.error)})},{legacy,content});
    await other.reload();await other.getByRole('button',{name:'轉入瀏覽器書架（1）',exact:true}).click();await other.getByText(/已轉入 1 份瀏覽器文件/).waitFor();
    assert.ok(fs.existsSync(path.join(libraryRoot,'books',legacyId,'original.txt')));
    assert.equal((await api('/documents')).value.length,6);
    // A failed manifest rename must not publish a new head.
    const saved=(await api('/documents/'+id)).value,parent=saved.revisions.at(-1);
    const failedNotes=[...parent.notes,{id:randomUUID(),body:'失敗不應發布版本',quote:'',location:'全文筆記',createdAt:new Date().toISOString()}];
    const failedId=randomUUID(),failedTime=Date.now();
    const failedEnvelope=marshal({action_type:'pageforge.note',timestamp:failedTime,sdto:{documentId:id,revisionId:failedId,parentId:parent.id,originalHash:saved.originalHash,contentHash:sha(parent.content),notesHash:sha(marshal(failedNotes)),restoredFrom:null,viewHash:sha(marshal({title:saved.title,filename:saved.filename,format:saved.format,sections:saved.sections,sheets:saved.sheets}))}}).toString('utf8');
    const failedRevision={id:failedId,parentId:parent.id,kind:'note',createdAt:new Date(failedTime).toISOString(),content:parent.content,notes:failedNotes,prevSAI:parent.sai,sai:toHex(await computeSAI(Buffer.from(parent.sai,'hex'),Buffer.from(failedEnvelope))),envelope:failedEnvelope};
    const realRename=fs.renameSync;
    try {
      fs.renameSync=function(source,destination){if(destination===path.join(book,'manifest.json')){const error=new Error('Simulated full disk');error.code='ENOSPC';throw error}return realRename.call(fs,source,destination)};
      const failed=await api('/documents/'+id+'/revisions','POST',{expectedHead:parent.id,revision:failedRevision});
      assert.equal(failed.status,500);assert.match(failed.value.error,/硬碟空間不足/);
    }finally{fs.renameSync=realRename}
    assert.equal((await api('/documents/'+id)).value.revisions.at(-1).id,parent.id);
    // Cross-site requests are rejected before reaching files.
    const blocked=await fetch(url+'/api/library/documents',{headers:{Origin:'https://example.com'}});assert.equal(blocked.status,403);
    const traversal=await fetch(url+'/api/library/collection-file?name=..%2FREADME.md');assert.equal(traversal.status,400);
    await fresh.close();
    await new Promise(resolve=>server.close(resolve));
    assert.ok(!fs.existsSync(path.join(libraryRoot,'.pageforge','server.lock')));
    server=createLibraryServer({libraryRoot});await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
    assert.equal((await api('/documents')).value.length,6);
    // Delete only removes the active shelf, retaining a recoverable folder in .trash.
    assert.equal((await api(`/documents/${legacyId}`,'DELETE')).status,200);
    assert.equal((await api('/documents')).value.length,5);
    assert.ok(fs.readdirSync(path.join(libraryRoot,'.trash')).some(name=>name.startsWith(legacyId)));
    assert.deepEqual(errors,[]);
    console.log('PASS: fixed-folder sources, immutable originals, disk versions/notes/progress, independent browsers, restart persistence, CAS conflicts, 5 formats, rescan/deduplication, migration, responsive shelf, origin/path checks, recoverable deletion, failed-manifest rollback.');
  }finally{await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exit(1)});
