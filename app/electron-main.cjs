const { app, BrowserWindow, shell, dialog, session, desktopCapturer, ipcMain, Notification, Tray, Menu } = require('electron');
const net = require('net');
const { autoUpdater } = require('electron-updater');
const path=require('path');
const os=require('os');
const fs=require('fs/promises');
const { pathToFileURL }=require('url');

let PORT=32145;
let mainWindow;
let updatePromptOpen=false;
let downloadedUpdate=false;
let updaterStatus={state:'idle',message:'Ready to check for updates.',revision:0};
let updateCheckPromise=null, updateDownloadPromise=null;
let tray=null;
let isQuitting=false;
let priorityTimer=null;
let forceExitTimer=null;

function applyLowPriorityToChildProcesses(){
  // Keep the Electron main process at normal priority so window/tray controls stay responsive.
  // Only renderer/helper processes are lowered to protect simulator CPU time.
  try{
    for(const metric of app.getAppMetrics()){
      const pid=metric?.pid;if(!pid||pid===process.pid||metric?.type==='Browser')continue;
      try{os.setPriority(pid,os.constants.priority.PRIORITY_BELOW_NORMAL)}catch{}
    }
  }catch{}
}


const gotSingleInstanceLock=app.requestSingleInstanceLock();
if(!gotSingleInstanceLock){
  app.quit();
}else{
  app.on('second-instance',()=>{
    if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();}
    else if(app.isReady()) createWindow();
  });
}

function portAvailable(port){
  return new Promise(resolve=>{
    const tester=net.createServer();
    tester.once('error',()=>resolve(false));
    tester.once('listening',()=>tester.close(()=>resolve(true)));
    tester.listen(port,'127.0.0.1');
  });
}
async function choosePort(){
  for(let p=32145;p<32245;p++) if(await portAvailable(p)) return p;
  throw new Error('No free local port available for SABIL GR Hub.');
}
function sendUpdateStatus(state,message,extra={}){updaterStatus={state,message,...extra,revision:updaterStatus.revision+1};if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('updater:status',updaterStatus);return updaterStatus;}

async function startBackend(){
  PORT=await choosePort();
  process.env.PORT=String(PORT);
  const backend=await import(pathToFileURL(path.join(__dirname,'server.js')).href);
  if(backend?.serverReady)await backend.serverReady;
}

function createWindow(){
  mainWindow=new BrowserWindow({
    width:1440,height:900,minWidth:1000,minHeight:700,
    backgroundColor:'#000000',title:'SABIL GR Hub',
    icon:path.join(__dirname,'sabil.ico'),autoHideMenuBar:true,
    webPreferences:{nodeIntegration:false,contextIsolation:true,backgroundThrottling:true,preload:path.join(__dirname,'preload.cjs')}
  });
  mainWindow.loadURL(`http://127.0.0.1:${PORT}`).catch(e=>{console.error('Window load failed:',e);});
  try{mainWindow.webContents.setBackgroundThrottling?.(true)}catch{}
  mainWindow.webContents.once('did-finish-load',()=>setTimeout(applyLowPriorityToChildProcesses,400));
  mainWindow.on('close',(e)=>{
    if(isQuitting)return;
    e.preventDefault();
    try{if(mainWindow.isFullScreen())mainWindow.setFullScreen(false);mainWindow.hide();}catch(err){console.warn('Window hide failed:',err)}
  });
  mainWindow.on('closed',()=>{mainWindow=null});
  mainWindow.on('unresponsive',()=>console.warn('SABIL GR Hub renderer became unresponsive.'));
  mainWindow.webContents.setWindowOpenHandler(({url})=>{shell.openExternal(url);return{action:'deny'}});
}

function showMainWindow(){
  if(mainWindow&&!mainWindow.isDestroyed()){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();return;}
  if(app.isReady())createWindow();
}
function hideMainWindow(){try{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.hide()}catch(e){console.warn('Hide window:',e)}}
function quitApp(){
  if(isQuitting)return;isQuitting=true;
  try{if(priorityTimer){clearInterval(priorityTimer);priorityTimer=null}}catch{}
  try{tray?.destroy();tray=null}catch{}
  try{mainWindow?.removeAllListeners('close')}catch{}
  // app.quit is graceful; app.exit is a fallback for a stuck renderer/backend.
  try{app.quit()}catch{}
  forceExitTimer=setTimeout(()=>{try{app.exit(0)}catch{}},1800);
}

function setupTray(){
  try{
    tray=new Tray(path.join(__dirname,'sabil.ico'));
    tray.setToolTip('SABIL GR Hub');
    tray.setContextMenu(Menu.buildFromTemplate([
      {label:'Open SABIL GR Hub',click:showMainWindow},
      {label:'Hide SABIL GR Hub',click:hideMainWindow},
      {type:'separator'},
      {label:'Quit SABIL GR Hub',click:quitApp}
    ]));
    tray.on('click',showMainWindow);
    tray.on('double-click',showMainWindow);
  }catch(e){console.warn('Tray setup failed:',e)}
}

function setupMediaPermissions(){
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback)=>{
    if(['media','display-capture'].includes(permission)) return callback(true);
    callback(false);
  });
  if(session.defaultSession.setDisplayMediaRequestHandler){
    session.defaultSession.setDisplayMediaRequestHandler(async(request,callback)=>{
      try{
        const sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:320,height:180}});
        callback({video:sources[0],audio:'loopback'});
      }catch(e){console.error('Display media picker:',e);callback({});}
    },{useSystemPicker:true});
  }
}

function setupUpdater(){
  autoUpdater.autoDownload=false;
  autoUpdater.autoInstallOnAppQuit=true;
  autoUpdater.allowPrerelease=false;
  autoUpdater.allowDowngrade=false;

  autoUpdater.on('update-available',(info)=>{
    // GitHub's latest.yml always points to the newest published release, so users can
    // jump directly from any older version to the current one (no sequential updates).
    sendUpdateStatus('available',`Latest available: v${info.version}`,{version:info.version});
    if(mainWindow) mainWindow.setTitle('SABIL GR Hub');
  });

  autoUpdater.on('download-progress',(p)=>{
    sendUpdateStatus('downloading',`Downloading update… ${Math.round(p.percent||0)}%`,{percent:Math.round(p.percent||0)});
    if(mainWindow) mainWindow.setTitle(`SABIL GR Hub — Update ${Math.round(p.percent||0)}%`);
  });

  autoUpdater.on('update-downloaded', async(info)=>{
    downloadedUpdate=true;sendUpdateStatus('downloaded',`SABIL GR Hub v${info.version} is ready to install.`,{version:info.version});
    if(mainWindow) mainWindow.setTitle('SABIL GR Hub');
    if(updatePromptOpen||!mainWindow||mainWindow.isDestroyed())return;
    updatePromptOpen=true;
    try{const r=await dialog.showMessageBox(mainWindow,{
      type:'info',title:'Update bereit',
      message:`SABIL GR Hub v${info.version} wurde heruntergeladen.`,
      detail:'Jetzt neu starten und das Update installieren?',
      buttons:['Neu starten & installieren','Später'],
      defaultId:0,cancelId:1,noLink:true
    });
    if(r.response===0) installReadyUpdate();
    }catch(e){console.warn('Update dialog failed:',e)}finally{updatePromptOpen=false}
  });

  autoUpdater.on('update-not-available',()=>{sendUpdateStatus('current','SABIL GR Hub is up to date.');if(mainWindow) mainWindow.setTitle('SABIL GR Hub')});
  autoUpdater.on('error',(e)=>{console.error('SABIL updater:',e);sendUpdateStatus('error','Update check failed: '+(e?.message||'Unknown error'));if(mainWindow) mainWindow.setTitle('SABIL GR Hub')});
}


ipcMain.handle('app:version',()=>app.getVersion());
ipcMain.handle('app:port',()=>PORT);
ipcMain.handle('desktop:hide',()=>{hideMainWindow();return {ok:true}});
ipcMain.handle('desktop:quit',()=>{quitApp();return {ok:true}});
ipcMain.handle('desktop:saveFile',async(_event,payload={})=>{
  try{
    const url=String(payload.url||'').trim();
    if(!/^https?:\/\//i.test(url))return {ok:false,error:'Invalid download URL.'};
    const requested=String(payload.name||'download').replace(/[<>:\"/\\|?*\x00-\x1F]/g,'_').slice(0,180)||'download';
    const chosen=await dialog.showSaveDialog(mainWindow,{title:'Save SABIL GR file',defaultPath:path.join(app.getPath('downloads'),requested),buttonLabel:'Save'});
    if(chosen.canceled||!chosen.filePath)return {ok:false,canceled:true};
    const response=await session.defaultSession.fetch(url);
    if(!response.ok)throw new Error(`Download failed (${response.status})`);
    const buffer=Buffer.from(await response.arrayBuffer());
    await fs.writeFile(chosen.filePath,buffer);
    return {ok:true,path:chosen.filePath};
  }catch(e){return {ok:false,error:e?.message||'Download failed.'};}
});

ipcMain.handle('desktop:notify',async(_event,payload={})=>{
  try{
    if(!Notification.isSupported()) return {ok:false,error:'Notifications are not supported by Windows.'};
    const n=new Notification({title:String(payload.title||'SABIL GR Hub').slice(0,120),body:String(payload.body||'').slice(0,500),icon:path.join(__dirname,'sabil-icon.png'),silent:true});
    n.on('click',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();}});
    n.show();
    return {ok:true};
  }catch(e){return {ok:false,error:e?.message||'Notification failed.'};}
});
function installReadyUpdate(){
  if(!downloadedUpdate||isQuitting)return;
  isQuitting=true;
  try{autoUpdater.quitAndInstall(false,true)}catch(e){isQuitting=false;sendUpdateStatus('error',e?.message||'Installation could not start.')}
}
ipcMain.handle('updater:status',()=>updaterStatus);
ipcMain.handle('updater:check',async()=>{
  if(!app.isPackaged)return sendUpdateStatus('dev','Updater is available in the installed build.');
  if(updateDownloadPromise||downloadedUpdate)return updaterStatus;
  if(updateCheckPromise)return updateCheckPromise;
  updateCheckPromise=(async()=>{
    sendUpdateStatus('checking','Checking GitHub Releases for updates…');
    try{
      const r=await autoUpdater.checkForUpdates();
      if(updaterStatus.state==='checking'){
        if(r?.isUpdateAvailable===true)sendUpdateStatus('available','Latest available: v'+r.updateInfo.version,{version:r.updateInfo.version});
        else sendUpdateStatus('current','SABIL GR Hub is up to date.');
      }
    }catch(e){sendUpdateStatus('error',e?.message||'Update check failed.')}
    return updaterStatus;
  })().finally(()=>{updateCheckPromise=null});
  return updateCheckPromise;
});
ipcMain.handle('updater:download',async()=>{
  if(updateDownloadPromise)return updateDownloadPromise;
  if(downloadedUpdate||updaterStatus.state!=='available')return updaterStatus;
  updateDownloadPromise=(async()=>{
    try{sendUpdateStatus('downloading','Starting update download…');await autoUpdater.downloadUpdate()}
    catch(e){sendUpdateStatus('error',e?.message||'Update download failed.')}
    return updaterStatus;
  })().finally(()=>{updateDownloadPromise=null});
  return updateDownloadPromise;
});
ipcMain.on('updater:install',()=>installReadyUpdate());

if(gotSingleInstanceLock) app.whenReady().then(async()=>{
  setupUpdater();
  setupMediaPermissions();
  setupTray();
  priorityTimer=setInterval(applyLowPriorityToChildProcesses,60000);priorityTimer.unref?.();
  try{await startBackend();createWindow()}catch(e){
    console.error('Backend startup failed:',e);
    dialog.showErrorBox('SABIL GR Hub could not start',e?.message||'Local backend failed to start.');
    quitApp();
  }
});
app.on('before-quit',()=>{isQuitting=true});
app.on('will-quit',()=>{try{tray?.destroy()}catch{}});
app.on('window-all-closed',()=>{});
app.on('activate',showMainWindow);
