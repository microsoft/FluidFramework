/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
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
const benchmarkTimeoutMilliseconds = Number(
	process.env.BENCHMARK_BROWSER_TIMEOUT_MS ?? 30_000,
);
if (!Number.isSafeInteger(benchmarkTimeoutMilliseconds) || benchmarkTimeoutMilliseconds <= 0) {
	throw new Error("BENCHMARK_BROWSER_TIMEOUT_MS must be a positive integer");
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
		this.events = [];
		this.socket = new WebSocket(url);
		this.socket.addEventListener("message", ({ data }) => {
			const message = JSON.parse(data);
			if (message.id === undefined) {
				this.events.push(message);
				return;
			}
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
		const root = normalized.startsWith("packages/sea-typescript/")
			? resolve(siteRoot, "../..")
			: siteRoot;
		const data = await readFile(join(root, normalized));
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
const profile = await mkdtemp(join(tmpdir(), "sea-integration-tests-"));
const pageParameters = new URLSearchParams(query);
pageParameters.set("transport", transportUrl);
pageParameters.set("hash", certificateHash);
const pageUrl = `http://localhost:${httpPort}/${page}?${pageParameters}`;
const cpuProfilePath = process.env.BENCHMARK_CPU_PROFILE_PATH;
const chromium = spawn(
	"chromium",
	[
		"--headless=new",
		"--no-sandbox",
		"--disable-gpu",
		"--disable-dev-shm-usage",
		`--user-data-dir=${profile}`,
		`--remote-debugging-port=${debugPort}`,
		cpuProfilePath === undefined ? pageUrl : "about:blank",
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
let cpuProfileStarted = false;
try {
	const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`, exited);
	const page = targets.find((target) => target.type === "page");
	assertPage(page);
	client = new CdpClient(page.webSocketDebuggerUrl);
	await client.ready();
	await client.send("Runtime.enable");
	await client.send("Log.enable");
	if (cpuProfilePath !== undefined) {
		await client.send("Page.enable");
		await client.send("Profiler.enable");
		await client.send("Profiler.setSamplingInterval", { interval: 100 });
		await client.send("Profiler.start");
		cpuProfileStarted = true;
		await client.send("Page.navigate", { url: pageUrl });
	}
	const evaluation = await client.send("Runtime.evaluate", {
		expression: `(async () => { const property = ${JSON.stringify(resultProperty)}; const timeout = error => ({ status: "failed", stage: window.__sharedTreeStage, error, telemetry: window.__sharedTreeTelemetry?.slice(-20) }); const deadline = Date.now() + ${benchmarkTimeoutMilliseconds}; while (!window[property] && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25)); if (!window[property]) return timeout("timed out waiting for " + property); return Promise.race([window[property], new Promise(resolve => setTimeout(() => resolve(timeout("timed out awaiting " + property)), ${benchmarkTimeoutMilliseconds}))]); })()`,
		awaitPromise: true,
		returnByValue: true,
	});
	if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.text);
	const result = evaluation.result.value;
	if (result?.status !== "passed") {
		result.browserDiagnostics = client.events
			.filter(
				({ method }) => method === "Runtime.exceptionThrown" || method === "Log.entryAdded",
			)
			.map(({ method, params }) => ({ method, params }));
	}
	console.log(`BROWSER_EVIDENCE=${JSON.stringify(result)}`);
	if (result?.status !== "passed") process.exitCode = 1;
} catch (error) {
	console.error(error.stack ?? error, errors);
	process.exitCode = 1;
} finally {
	if (cpuProfileStarted) {
		const { profile: cpuProfile } = await client.send("Profiler.stop");
		await writeFile(cpuProfilePath, JSON.stringify(cpuProfile));
	}
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
