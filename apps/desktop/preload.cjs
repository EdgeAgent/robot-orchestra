const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("orchestraDesktop", {
  showFloatingHead: () => ipcRenderer.send("companion:head"),
  openChat: () => ipcRenderer.send("companion:chat"),
  openDashboard: () => ipcRenderer.send("dashboard:open"),
  beginCompanionDrag: (screenX, screenY) => ipcRenderer.send("companion:drag-start", { screenX, screenY }),
  moveCompanionDrag: (screenX, screenY) => ipcRenderer.send("companion:drag-move", { screenX, screenY }),
  endCompanionDrag: () => ipcRenderer.send("companion:drag-end"),
  onCompanionState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("companion:state", listener);
    return () => ipcRenderer.removeListener("companion:state", listener);
  },
});
