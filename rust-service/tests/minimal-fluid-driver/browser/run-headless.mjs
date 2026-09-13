import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { createServer as createNetServer } from "node:net";

const [
	siteRoot,
	transportUrl,
	certificateHash,
	resultProperty = "__minimalFluidDriverResult",
	page = "index.html",
	query = "",
] = process.argv.slice(2);
if (
	!siteRoot ||
	!transportUrl ||
	!/^[0-9a-f]{64}$/i.test(certificateHash ?? "") ||
	!/^__[A-Za-z0-9]+Result$/u.test(resultProperty) ||
	!/^[A-Za-z0-9._-]+$/u.test(page)
) {
	throw new Error(
		"usage: node run-headless.mjs <site-root> <transport-url> <certificate-sha256-hex> [result-property] [page] [query]",
	);
}

function freePort() {
	return new Promise((resolve, reject) => {
		const server = createNetServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address();
			server.close((error) => (error ? reject(error) : resolve(port)));
		});
	});
}

async function waitForJson(url, exited) {
	for (let attempt = 0; attempt < 300; attempt++) {
		if (exited.value) throw new Error("Chromium exited before exposing CDP");
		try {
			const response = await fetch(url);
			if (response.ok) return response.json();
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`timed out waiting for ${url}`);
}

class CdpClient {
	constructor(url) {
		this.id = 1;
		this.pending = new Map();
		this.socket = new WebSocket(url);
		this.socket.addEventListener("message", ({ data }) => {
			const message = JSON.parse(data);
			const pending = this.pending.get(message.id);
			if (pending) {
				this.pending.delete(message.id);
				message.error
					? pending.reject(new Error(message.error.message))
					: pending.resolve(message.result);
			}
		});
	}
	async ready() {
		if (this.socket.readyState !== WebSocket.OPEN) {
			await new Promise((resolve, reject) => {
				this.socket.addEventListener("open", resolve, { once: true });
				this.socket.addEventListener("error", reject, { once: true });
			});
		}
	}
	send(method, params = {}) {
		const id = this.id++;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.socket.send(JSON.stringify({ id, method, params }));
		});
	}
	close() {
		this.socket.close();
	}
}

const contentTypes = new Map([
	[".html", "text/html"],
	[".js", "text/javascript"],
	[".mjs", "text/javascript"],
	[".wasm", "application/wasm"],
]);
const server = createServer(async (request, response) => {
	try {
		const relative =
			new URL(request.url, "http://localhost").pathname.slice(1) || "index.html";
		const normalized = normalize(relative);
		if (normalized.startsWith("..")) throw new Error("invalid path");
		const data = await readFile(join(siteRoot, normalized));
		response.writeHead(200, {
			"content-type": contentTypes.get(extname(normalized)) ?? "application/octet-stream",
		});
		response.end(data);
	} catch {
		response.writeHead(404).end("not found");
	}
});

const httpPort = await freePort();
await new Promise((resolve, reject) => {
	server.once("error", reject);
	server.listen(httpPort, "127.0.0.1", resolve);
});
const debugPort = await freePort();
const profile = await mkdtemp(join(tmpdir(), "minimal-fluid-driver-"));
const pageParameters = new URLSearchParams(query);
pageParameters.set("transport", transportUrl);
pageParameters.set("hash", certificateHash);
const pageUrl = `http://localhost:${httpPort}/${page}?${pageParameters}`;
const chromium = spawn(
	"chromium",
	[
		"--headless=new",
		"--no-sandbox",
		"--disable-gpu",
		"--disable-dev-shm-usage",
		`--user-data-dir=${profile}`,
		`--remote-debugging-port=${debugPort}`,
		pageUrl,
	],
	{ stdio: ["ignore", "ignore", "pipe"] },
);
const exited = { value: false };
let errors = "";
chromium.stderr.on("data", (chunk) => {
	errors += chunk;
});
chromium.once("exit", () => {
	exited.value = true;
});
let client;
try {
	const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`, exited);
	const page = targets.find((target) => target.type === "page");
	assertPage(page);
	client = new CdpClient(page.webSocketDebuggerUrl);
	await client.ready();
	await client.send("Runtime.enable");
	const evaluation = await client.send("Runtime.evaluate", {
		expression: `(async () => { const property = ${JSON.stringify(resultProperty)}; const timeout = error => ({ status: "failed", stage: window.__sharedTreeStage, error, telemetry: window.__sharedTreeTelemetry?.slice(-20) }); const deadline = Date.now() + 30000; while (!window[property] && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25)); if (!window[property]) return timeout("timed out waiting for " + property); return Promise.race([window[property], new Promise(resolve => setTimeout(() => resolve(timeout("timed out awaiting " + property)), 30000))]); })()`,
		awaitPromise: true,
		returnByValue: true,
	});
	if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.text);
	console.log(`BROWSER_EVIDENCE=${JSON.stringify(evaluation.result.value)}`);
	if (evaluation.result.value?.status !== "passed") process.exitCode = 1;
} catch (error) {
	console.error(error.stack ?? error, errors);
	process.exitCode = 1;
} finally {
	client?.close();
	if (!exited.value) {
		chromium.kill("SIGTERM");
		await new Promise((resolve) => chromium.once("exit", resolve));
	}
	server.close();
	await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function assertPage(page) {
	if (!page) throw new Error("Chromium did not expose a page target");
}
