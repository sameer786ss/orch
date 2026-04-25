let electron = require("electron");
//#region electron/preload.ts
var ipc = {
	openFolder: () => electron.ipcRenderer.invoke("fs:open-folder"),
	readFile: (p) => electron.ipcRenderer.invoke("fs:read-file", p),
	writeFile: (p, c) => electron.ipcRenderer.invoke("fs:write-file", p, c),
	createFile: (p, c) => electron.ipcRenderer.invoke("fs:create-file", p, c),
	deleteFile: (p) => electron.ipcRenderer.invoke("fs:delete-file", p),
	listDir: (p) => electron.ipcRenderer.invoke("fs:list-dir", p),
	buildTree: (p) => electron.ipcRenderer.invoke("fs:build-tree", p),
	startWatcher: (workspace) => electron.ipcRenderer.invoke("fs:watch-start", workspace),
	stopWatcher: () => electron.ipcRenderer.invoke("fs:watch-stop"),
	onWatcherEvent: (cb) => {
		const fn = (_, e) => cb(e);
		electron.ipcRenderer.on("fs:watcher-event", fn);
		return () => electron.ipcRenderer.off("fs:watcher-event", fn);
	},
	startIndexing: (workspace) => electron.ipcRenderer.invoke("index:start", workspace),
	onIndexProgress: (cb) => {
		const fn = (_, d) => cb(d);
		electron.ipcRenderer.on("index:progress", fn);
		return () => electron.ipcRenderer.off("index:progress", fn);
	},
	startChat: (conversationId, messages, workspacePath) => electron.ipcRenderer.send("ai:start-chat", {
		conversationId,
		messages,
		workspacePath
	}),
	onTextChunk: (cb) => {
		const fn = (_, d) => cb(d);
		electron.ipcRenderer.on("ai:text-chunk", fn);
		return () => electron.ipcRenderer.off("ai:text-chunk", fn);
	},
	onToolCall: (cb) => {
		const fn = (_, d) => cb(d);
		electron.ipcRenderer.on("ai:tool-call", fn);
		return () => electron.ipcRenderer.off("ai:tool-call", fn);
	},
	onToolResult: (cb) => {
		const fn = (_, d) => cb(d);
		electron.ipcRenderer.on("ai:tool-result", fn);
		return () => electron.ipcRenderer.off("ai:tool-result", fn);
	},
	onAiDone: (cb) => {
		const fn = (_, d) => cb(d);
		electron.ipcRenderer.on("ai:done", fn);
		return () => electron.ipcRenderer.off("ai:done", fn);
	},
	onAiError: (cb) => {
		const fn = (_, d) => cb(d);
		electron.ipcRenderer.on("ai:error", fn);
		return () => electron.ipcRenderer.off("ai:error", fn);
	},
	getConversations: () => electron.ipcRenderer.invoke("db:get-conversations"),
	getMessages: (conversationId) => electron.ipcRenderer.invoke("db:get-messages", conversationId),
	saveConversation: (conv) => electron.ipcRenderer.invoke("db:save-conversation", conv),
	saveMessage: (convId, msg) => electron.ipcRenderer.invoke("db:save-message", convId, msg),
	deleteConversation: (id) => electron.ipcRenderer.invoke("db:delete-conversation", id),
	webSearch: (query, depth) => electron.ipcRenderer.invoke("web:search", query, depth),
	platform: process.platform
};
electron.contextBridge.exposeInMainWorld("orch", ipc);
//#endregion
