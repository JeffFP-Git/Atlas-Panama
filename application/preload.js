// Use CommonJS to avoid ESM loader edge-cases in Electron preload
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('runner', {
	run: (payload) => ipcRenderer.invoke('run-scraper', payload),
	cancel: () => ipcRenderer.invoke('cancel-scraper'),
	onLog: (cb) => {
		const handler = (_e, msg) => cb(msg);
		ipcRenderer.on('scraper-log', handler);
		return () => ipcRenderer.removeListener('scraper-log', handler);
	}
});


