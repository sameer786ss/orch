Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const require_chunk = require("./chunk-Ble4zEEl.js");
let electron = require("electron");
let node_url = require("node:url");
let node_path = require("node:path");
node_path = require_chunk.__toESM(node_path);
let node_fs_promises = require("node:fs/promises");
node_fs_promises = require_chunk.__toESM(node_fs_promises);
//#region node_modules/dotenv/lib/main.js
var require_main = /* @__PURE__ */ require_chunk.__commonJSMin(((exports, module) => {
	var fs = require("fs");
	var path$1 = require("path");
	var os = require("os");
	var crypto = require("crypto");
	var TIPS = [
		"◈ encrypted .env [www.dotenvx.com]",
		"◈ secrets for agents [www.dotenvx.com]",
		"⌁ auth for agents [www.vestauth.com]",
		"⌘ custom filepath { path: '/custom/path/.env' }",
		"⌘ enable debugging { debug: true }",
		"⌘ override existing { override: true }",
		"⌘ suppress logs { quiet: true }",
		"⌘ multiple files { path: ['.env.local', '.env'] }"
	];
	function _getRandomTip() {
		return TIPS[Math.floor(Math.random() * TIPS.length)];
	}
	function parseBoolean(value) {
		if (typeof value === "string") return ![
			"false",
			"0",
			"no",
			"off",
			""
		].includes(value.toLowerCase());
		return Boolean(value);
	}
	function supportsAnsi() {
		return process.stdout.isTTY;
	}
	function dim(text) {
		return supportsAnsi() ? `\x1b[2m${text}\x1b[0m` : text;
	}
	var LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;
	function parse(src) {
		const obj = {};
		let lines = src.toString();
		lines = lines.replace(/\r\n?/gm, "\n");
		let match;
		while ((match = LINE.exec(lines)) != null) {
			const key = match[1];
			let value = match[2] || "";
			value = value.trim();
			const maybeQuote = value[0];
			value = value.replace(/^(['"`])([\s\S]*)\1$/gm, "$2");
			if (maybeQuote === "\"") {
				value = value.replace(/\\n/g, "\n");
				value = value.replace(/\\r/g, "\r");
			}
			obj[key] = value;
		}
		return obj;
	}
	function _parseVault(options) {
		options = options || {};
		const vaultPath = _vaultPath(options);
		options.path = vaultPath;
		const result = DotenvModule.configDotenv(options);
		if (!result.parsed) {
			const err = /* @__PURE__ */ new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
			err.code = "MISSING_DATA";
			throw err;
		}
		const keys = _dotenvKey(options).split(",");
		const length = keys.length;
		let decrypted;
		for (let i = 0; i < length; i++) try {
			const attrs = _instructions(result, keys[i].trim());
			decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
			break;
		} catch (error) {
			if (i + 1 >= length) throw error;
		}
		return DotenvModule.parse(decrypted);
	}
	function _warn(message) {
		console.error(`⚠ ${message}`);
	}
	function _debug(message) {
		console.log(`┆ ${message}`);
	}
	function _log(message) {
		console.log(`◇ ${message}`);
	}
	function _dotenvKey(options) {
		if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) return options.DOTENV_KEY;
		if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) return process.env.DOTENV_KEY;
		return "";
	}
	function _instructions(result, dotenvKey) {
		let uri;
		try {
			uri = new URL(dotenvKey);
		} catch (error) {
			if (error.code === "ERR_INVALID_URL") {
				const err = /* @__PURE__ */ new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
				err.code = "INVALID_DOTENV_KEY";
				throw err;
			}
			throw error;
		}
		const key = uri.password;
		if (!key) {
			const err = /* @__PURE__ */ new Error("INVALID_DOTENV_KEY: Missing key part");
			err.code = "INVALID_DOTENV_KEY";
			throw err;
		}
		const environment = uri.searchParams.get("environment");
		if (!environment) {
			const err = /* @__PURE__ */ new Error("INVALID_DOTENV_KEY: Missing environment part");
			err.code = "INVALID_DOTENV_KEY";
			throw err;
		}
		const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
		const ciphertext = result.parsed[environmentKey];
		if (!ciphertext) {
			const err = /* @__PURE__ */ new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
			err.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
			throw err;
		}
		return {
			ciphertext,
			key
		};
	}
	function _vaultPath(options) {
		let possibleVaultPath = null;
		if (options && options.path && options.path.length > 0) if (Array.isArray(options.path)) {
			for (const filepath of options.path) if (fs.existsSync(filepath)) possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
		} else possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
		else possibleVaultPath = path$1.resolve(process.cwd(), ".env.vault");
		if (fs.existsSync(possibleVaultPath)) return possibleVaultPath;
		return null;
	}
	function _resolveHome(envPath) {
		return envPath[0] === "~" ? path$1.join(os.homedir(), envPath.slice(1)) : envPath;
	}
	function _configVault(options) {
		const debug = parseBoolean(process.env.DOTENV_CONFIG_DEBUG || options && options.debug);
		const quiet = parseBoolean(process.env.DOTENV_CONFIG_QUIET || options && options.quiet);
		if (debug || !quiet) _log("loading env from encrypted .env.vault");
		const parsed = DotenvModule._parseVault(options);
		let processEnv = process.env;
		if (options && options.processEnv != null) processEnv = options.processEnv;
		DotenvModule.populate(processEnv, parsed, options);
		return { parsed };
	}
	function configDotenv(options) {
		const dotenvPath = path$1.resolve(process.cwd(), ".env");
		let encoding = "utf8";
		let processEnv = process.env;
		if (options && options.processEnv != null) processEnv = options.processEnv;
		let debug = parseBoolean(processEnv.DOTENV_CONFIG_DEBUG || options && options.debug);
		let quiet = parseBoolean(processEnv.DOTENV_CONFIG_QUIET || options && options.quiet);
		if (options && options.encoding) encoding = options.encoding;
		else if (debug) _debug("no encoding is specified (UTF-8 is used by default)");
		let optionPaths = [dotenvPath];
		if (options && options.path) if (!Array.isArray(options.path)) optionPaths = [_resolveHome(options.path)];
		else {
			optionPaths = [];
			for (const filepath of options.path) optionPaths.push(_resolveHome(filepath));
		}
		let lastError;
		const parsedAll = {};
		for (const path of optionPaths) try {
			const parsed = DotenvModule.parse(fs.readFileSync(path, { encoding }));
			DotenvModule.populate(parsedAll, parsed, options);
		} catch (e) {
			if (debug) _debug(`failed to load ${path} ${e.message}`);
			lastError = e;
		}
		const populated = DotenvModule.populate(processEnv, parsedAll, options);
		debug = parseBoolean(processEnv.DOTENV_CONFIG_DEBUG || debug);
		quiet = parseBoolean(processEnv.DOTENV_CONFIG_QUIET || quiet);
		if (debug || !quiet) {
			const keysCount = Object.keys(populated).length;
			const shortPaths = [];
			for (const filePath of optionPaths) try {
				const relative = path$1.relative(process.cwd(), filePath);
				shortPaths.push(relative);
			} catch (e) {
				if (debug) _debug(`failed to load ${filePath} ${e.message}`);
				lastError = e;
			}
			_log(`injected env (${keysCount}) from ${shortPaths.join(",")} ${dim(`// tip: ${_getRandomTip()}`)}`);
		}
		if (lastError) return {
			parsed: parsedAll,
			error: lastError
		};
		else return { parsed: parsedAll };
	}
	function config(options) {
		if (_dotenvKey(options).length === 0) return DotenvModule.configDotenv(options);
		const vaultPath = _vaultPath(options);
		if (!vaultPath) {
			_warn(`you set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}`);
			return DotenvModule.configDotenv(options);
		}
		return DotenvModule._configVault(options);
	}
	function decrypt(encrypted, keyStr) {
		const key = Buffer.from(keyStr.slice(-64), "hex");
		let ciphertext = Buffer.from(encrypted, "base64");
		const nonce = ciphertext.subarray(0, 12);
		const authTag = ciphertext.subarray(-16);
		ciphertext = ciphertext.subarray(12, -16);
		try {
			const aesgcm = crypto.createDecipheriv("aes-256-gcm", key, nonce);
			aesgcm.setAuthTag(authTag);
			return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
		} catch (error) {
			const isRange = error instanceof RangeError;
			const invalidKeyLength = error.message === "Invalid key length";
			const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
			if (isRange || invalidKeyLength) {
				const err = /* @__PURE__ */ new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
				err.code = "INVALID_DOTENV_KEY";
				throw err;
			} else if (decryptionFailed) {
				const err = /* @__PURE__ */ new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
				err.code = "DECRYPTION_FAILED";
				throw err;
			} else throw error;
		}
	}
	function populate(processEnv, parsed, options = {}) {
		const debug = Boolean(options && options.debug);
		const override = Boolean(options && options.override);
		const populated = {};
		if (typeof parsed !== "object") {
			const err = /* @__PURE__ */ new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
			err.code = "OBJECT_REQUIRED";
			throw err;
		}
		for (const key of Object.keys(parsed)) if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
			if (override === true) {
				processEnv[key] = parsed[key];
				populated[key] = parsed[key];
			}
			if (debug) if (override === true) _debug(`"${key}" is already defined and WAS overwritten`);
			else _debug(`"${key}" is already defined and was NOT overwritten`);
		} else {
			processEnv[key] = parsed[key];
			populated[key] = parsed[key];
		}
		return populated;
	}
	var DotenvModule = {
		configDotenv,
		_configVault,
		_parseVault,
		config,
		decrypt,
		parse,
		populate
	};
	module.exports.configDotenv = DotenvModule.configDotenv;
	module.exports._configVault = DotenvModule._configVault;
	module.exports._parseVault = DotenvModule._parseVault;
	module.exports.config = DotenvModule.config;
	module.exports.decrypt = DotenvModule.decrypt;
	module.exports.parse = DotenvModule.parse;
	module.exports.populate = DotenvModule.populate;
	module.exports = DotenvModule;
}));
//#endregion
//#region node_modules/dotenv/lib/env-options.js
var require_env_options = /* @__PURE__ */ require_chunk.__commonJSMin(((exports, module) => {
	var options = {};
	if (process.env.DOTENV_CONFIG_ENCODING != null) options.encoding = process.env.DOTENV_CONFIG_ENCODING;
	if (process.env.DOTENV_CONFIG_PATH != null) options.path = process.env.DOTENV_CONFIG_PATH;
	if (process.env.DOTENV_CONFIG_QUIET != null) options.quiet = process.env.DOTENV_CONFIG_QUIET;
	if (process.env.DOTENV_CONFIG_DEBUG != null) options.debug = process.env.DOTENV_CONFIG_DEBUG;
	if (process.env.DOTENV_CONFIG_OVERRIDE != null) options.override = process.env.DOTENV_CONFIG_OVERRIDE;
	if (process.env.DOTENV_CONFIG_DOTENV_KEY != null) options.DOTENV_KEY = process.env.DOTENV_CONFIG_DOTENV_KEY;
	module.exports = options;
}));
//#endregion
//#region node_modules/dotenv/lib/cli-options.js
var require_cli_options = /* @__PURE__ */ require_chunk.__commonJSMin(((exports, module) => {
	var re = /^dotenv_config_(encoding|path|quiet|debug|override|DOTENV_KEY)=(.+)$/;
	module.exports = function optionMatcher(args) {
		const options = args.reduce(function(acc, cur) {
			const matches = cur.match(re);
			if (matches) acc[matches[1]] = matches[2];
			return acc;
		}, {});
		if (!("quiet" in options)) options.quiet = "true";
		return options;
	};
}));
//#endregion
//#region node_modules/dotenv/config.js
(function() {
	require_main().config(Object.assign({}, require_env_options(), require_cli_options()(process.argv)));
})();
//#endregion
//#region electron/main.ts
var _dirname = typeof __dirname !== "undefined" ? __dirname : node_path.default.dirname((0, node_url.fileURLToPath)({}.url));
electron.app.commandLine.appendSwitch("use-mock-keychain");
electron.app.commandLine.appendSwitch("password-store", "basic");
electron.app.commandLine.appendSwitch("disable-renderer-backgrounding");
electron.app.commandLine.appendSwitch("enable-gpu-rasterization");
electron.app.commandLine.appendSwitch("enable-zero-copy");
electron.app.commandLine.appendSwitch("ignore-gpu-blocklist");
if (process.platform !== "darwin") electron.app.commandLine.appendSwitch("force_high_performance_gpu");
if (process.platform === "linux") electron.app.commandLine.appendSwitch("enable-features", "CanvasOopRasterization,VaapiVideoDecoder");
else electron.app.commandLine.appendSwitch("enable-features", "CanvasOopRasterization");
process.env.APP_ROOT = node_path.default.join(_dirname, "..");
var VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
var MAIN_DIST = node_path.default.join(process.env.APP_ROOT, "dist-electron");
var RENDERER_DIST = node_path.default.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? node_path.default.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
var win = null;
var currentWorkspacePath = null;
function resolveSafePath(inputPath) {
	return node_path.default.resolve(inputPath);
}
function isPathInside(candidatePath, rootPath) {
	const relative = node_path.default.relative(rootPath, candidatePath);
	return relative === "" || !relative.startsWith("..") && !node_path.default.isAbsolute(relative);
}
function ensureWorkspacePath() {
	if (!currentWorkspacePath) throw new Error("No workspace selected");
	return currentWorkspacePath;
}
function assertPathInWorkspace(targetPath) {
	const workspace = ensureWorkspacePath();
	const resolved = resolveSafePath(targetPath);
	if (!isPathInside(resolved, workspace)) throw new Error("Path is outside the active workspace");
	return resolved;
}
function setWorkspacePath(workspacePath) {
	const resolved = resolveSafePath(workspacePath);
	currentWorkspacePath = resolved;
	return resolved;
}
function createWindow() {
	win = new electron.BrowserWindow({
		icon: node_path.default.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
		backgroundColor: "#0d0d0d",
		show: false,
		width: 1400,
		height: 900,
		minWidth: 900,
		minHeight: 600,
		titleBarStyle: "hidden",
		titleBarOverlay: {
			color: "#0d0d0d",
			symbolColor: "#888888",
			height: 38
		},
		webPreferences: {
			preload: node_path.default.join(_dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false
		}
	});
	if (process.platform === "darwin") win.setWindowButtonPosition({
		x: 14,
		y: 12
	});
	win.once("ready-to-show", () => win?.show());
	if (VITE_DEV_SERVER_URL) win.webContents.on("console-message", (_event, level, message, _line, _sourceId) => {
		const levelName = [
			"DEBUG",
			"INFO",
			"WARN",
			"ERROR"
		][level] || "LOG";
		console.log(`[RENDERER-${levelName}] ${message}`);
	});
	if (VITE_DEV_SERVER_URL) win.loadURL(VITE_DEV_SERVER_URL);
	else win.loadFile(node_path.default.join(RENDERER_DIST, "index.html"));
}
electron.ipcMain.handle("fs:open-folder", async () => {
	if (!win) return null;
	const selected = (await electron.dialog.showOpenDialog(win, { properties: ["openDirectory"] })).filePaths[0] ?? null;
	if (selected) setWorkspacePath(selected);
	return selected;
});
electron.ipcMain.handle("fs:read-file", async (_, filePath) => {
	const safePath = assertPathInWorkspace(filePath);
	return node_fs_promises.readFile(safePath, "utf-8");
});
electron.ipcMain.handle("fs:write-file", async (_, filePath, content) => {
	const safePath = assertPathInWorkspace(filePath);
	await node_fs_promises.writeFile(safePath, content, "utf-8");
	return true;
});
electron.ipcMain.handle("fs:create-file", async (_, filePath, content = "") => {
	const safePath = assertPathInWorkspace(filePath);
	await node_fs_promises.mkdir(node_path.default.dirname(safePath), { recursive: true });
	await node_fs_promises.writeFile(safePath, content, "utf-8");
	return true;
});
electron.ipcMain.handle("fs:delete-file", async (_, filePath) => {
	const safePath = assertPathInWorkspace(filePath);
	await node_fs_promises.rm(safePath, {
		recursive: true,
		force: true
	});
	return true;
});
electron.ipcMain.handle("fs:list-dir", async (_, dirPath) => {
	const safePath = assertPathInWorkspace(dirPath);
	const { expandDir } = await Promise.resolve().then(() => require("./indexer-V9klzhlZ.js"));
	return expandDir(safePath);
});
electron.ipcMain.handle("fs:build-tree", async (_, dirPath) => {
	const safePath = assertPathInWorkspace(dirPath);
	const { buildFileTree } = await Promise.resolve().then(() => require("./indexer-V9klzhlZ.js"));
	return buildFileTree(safePath);
});
electron.ipcMain.handle("fs:watch-start", async (_, workspace) => {
	const safeWorkspace = setWorkspacePath(workspace);
	const { startWatcher } = await Promise.resolve().then(() => require("./indexer-V9klzhlZ.js"));
	startWatcher(safeWorkspace, (event) => {
		win?.webContents.send("fs:watcher-event", event);
	});
	return true;
});
electron.ipcMain.handle("fs:watch-stop", async () => {
	const { stopWatcher } = await Promise.resolve().then(() => require("./indexer-V9klzhlZ.js"));
	stopWatcher();
	return true;
});
electron.ipcMain.handle("index:start", async (_, workspace) => {
	const safeWorkspace = setWorkspacePath(workspace);
	const { startIndexing } = await Promise.resolve().then(() => require("./indexer-V9klzhlZ.js"));
	startIndexing(safeWorkspace, (indexed, total, file) => {
		win?.webContents.send("index:progress", {
			indexed,
			total,
			file
		});
	});
	return true;
});
electron.ipcMain.on("ai:start-chat", async (event, { conversationId, messages, workspacePath }) => {
	console.log("[MAIN] ai:start-chat received, convId:", conversationId, "msgs:", messages?.length);
	const { runAgentChat } = await Promise.resolve().then(() => require("./ai-oFt3PquJ.js"));
	try {
		await runAgentChat(event, conversationId, messages, workspacePath);
	} catch (err) {
		console.error("[MAIN] runAgentChat threw:", err.message);
		event.reply("ai:error", {
			conversationId,
			error: err.message
		});
		event.reply("ai:done", { conversationId });
	}
});
electron.ipcMain.handle("web:search", async (_, query, depth = "basic") => {
	const { tavily } = await Promise.resolve().then(() => require("./dist-xtXPF7Eb.js")).then((n) => n.dist_exports);
	const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY || "" });
	try {
		return await tvly.search(query, {
			searchDepth: depth,
			maxResults: 6,
			includeAnswer: true
		});
	} catch (err) {
		console.error("[MAIN] web:search error:", err.message);
		return { error: err.message };
	}
});
electron.ipcMain.handle("db:get-conversations", async () => {
	const { dbGetConversations } = await Promise.resolve().then(() => require("./db-Cl6jLUMk.js"));
	return dbGetConversations();
});
electron.ipcMain.handle("db:get-messages", async (_, conversationId) => {
	const { dbGetMessages } = await Promise.resolve().then(() => require("./db-Cl6jLUMk.js"));
	return dbGetMessages(conversationId);
});
electron.ipcMain.handle("db:save-conversation", async (_, conv) => {
	const { dbSaveConversation } = await Promise.resolve().then(() => require("./db-Cl6jLUMk.js"));
	await dbSaveConversation(conv);
	return true;
});
electron.ipcMain.handle("db:save-message", async (_, conversationId, msg) => {
	const { dbSaveMessage } = await Promise.resolve().then(() => require("./db-Cl6jLUMk.js"));
	await dbSaveMessage(conversationId, msg);
	return true;
});
electron.ipcMain.handle("db:delete-conversation", async (_, id) => {
	const { dbDeleteConversation } = await Promise.resolve().then(() => require("./db-Cl6jLUMk.js"));
	await dbDeleteConversation(id);
	return true;
});
electron.app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		electron.app.quit();
		win = null;
	}
});
electron.app.on("activate", () => {
	if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
});
electron.app.on("before-quit", async () => {
	const [{ stopWatcher }, { dbFlushNow }] = await Promise.all([Promise.resolve().then(() => require("./indexer-V9klzhlZ.js")), Promise.resolve().then(() => require("./db-Cl6jLUMk.js"))]);
	stopWatcher();
	dbFlushNow();
});
electron.app.whenReady().then(createWindow);
//#endregion
exports.MAIN_DIST = MAIN_DIST;
exports.RENDERER_DIST = RENDERER_DIST;
exports.VITE_DEV_SERVER_URL = VITE_DEV_SERVER_URL;
