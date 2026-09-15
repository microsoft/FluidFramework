/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { createServer as createNetServer } from "node:net";

const [siteRoot, transportUrl, certificateHash, shutdownMarker] = process.argv.slice(2);
if (!siteRoot || !transportUrl || !/^[0-9a-f]{64}$/i.test(certificateHash ?? "")) {
	throw new Error(
		"usage: node run-headless.mjs <site-root> <transport-url> <certificate-sha256-hex>",
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

function delay(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForJson(url, browserExit, attempts = 300) {
	let lastError;
	for (let attempt = 0; attempt < attempts; attempt++) {
		if (browserExit.exited) {
			throw new Error(`Chromium exited before exposing CDP (code ${browserExit.code})`);
		}
		try {
			const response = await fetch(url);
			if (response.ok) return response.json();
		} catch (error) {
			lastError = error;
		}
		await delay(100);
	}
	throw lastError ?? new Error(`timed out waiting for ${url}`);
}

async function waitForFile(path, attempts = 200) {
	let lastError;
	for (let attempt = 0; attempt < attempts; attempt++) {
		try {
			return await readFile(path, "utf8");
		} catch (error) {
			lastError = error;
		}
		await delay(25);
	}
	throw lastError ?? new Error(`timed out waiting for ${path}`);
}

class CdpClient {
	constructor(url) {
		this.nextId = 1;
		this.pending = new Map();
		this.socket = new WebSocket(url);
		this.socket.addEventListener("message", (event) => {
			const message = JSON.parse(event.data);
			if (message.id && this.pending.has(message.id)) {
				const { resolve, reject } = this.pending.get(message.id);
				this.pending.delete(message.id);
				message.error ? reject(new Error(message.error.message)) : resolve(message.result);
			}
		});
	}

	async ready() {
		if (this.socket.readyState === WebSocket.OPEN) return;
		await new Promise((resolve, reject) => {
			this.socket.addEventListener("open", resolve, { once: true });
			this.socket.addEventListener("error", reject, { once: true });
		});
	}

	send(method, params = {}) {
		const id = this.nextId++;
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
	[".html", "text/html; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
	[".mjs", "text/javascript; charset=utf-8"],
	[".wasm", "application/wasm"],
]);

const httpServer = createServer(async (request, response) => {
	try {
		const requestPath = new URL(request.url, "http://localhost").pathname;
		const relative = requestPath === "/" ? "index.html" : requestPath.slice(1);
		const normalized = normalize(relative);
		if (normalized.startsWith("..")) throw new Error("invalid path");
		const data = await readFile(join(siteRoot, normalized));
		response.writeHead(200, {
			"content-type": contentTypes.get(extname(normalized)) ?? "application/octet-stream",
		});
		response.end(data);
	} catch {
		response.writeHead(404);
		response.end("not found");
	}
});

const httpPort = await freePort();
await new Promise((resolve, reject) => {
	httpServer.once("error", reject);
	httpServer.listen(httpPort, "127.0.0.1", resolve);
});
const debugPort = await freePort();
const profile = await mkdtemp(join(tmpdir(), "fluid-webtransport-chromium-"));
const pageUrl = `http://localhost:${httpPort}/?transport=${encodeURIComponent(transportUrl)}&hash=${certificateHash}`;
const chromium = spawn(
	"chromium",
	[
		"--headless=new",
		"--no-sandbox",
		"--disable-gpu",
		"--disable-dev-shm-usage",
		`--user-data-dir=${profile}`,
		"--remote-debugging-address=127.0.0.1",
		`--remote-debugging-port=${debugPort}`,
		pageUrl,
	],
	{ stdio: ["ignore", "ignore", "pipe"] },
);
let chromiumErrors = "";
const browserExit = { exited: false, code: null };
chromium.stderr.on("data", (chunk) => {
	chromiumErrors += chunk;
});
chromium.once("exit", (code) => {
	browserExit.exited = true;
	browserExit.code = code;
});

let client;
try {
	const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`, browserExit);
	const page = targets.find((target) => target.type === "page");
	if (!page) throw new Error("Chromium did not expose a page target");
	client = new CdpClient(page.webSocketDebuggerUrl);
	await client.ready();
	await client.send("Runtime.enable");
	const evaluation = await client.send("Runtime.evaluate", {
		expression: `(async () => {
            const deadline = Date.now() + 30000;
            while (!window.__webtransportResult && Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, 25));
            }
            if (!window.__webtransportResult) throw new Error("browser test did not start");
            return window.__webtransportResult;
        })()`,
		awaitPromise: true,
		returnByValue: true,
	});
	if (evaluation.exceptionDetails) {
		throw new Error(evaluation.exceptionDetails.text);
	}
	const result = evaluation.result.value;
	console.log(`BROWSER_EVIDENCE=${JSON.stringify(result)}`);
	if (result?.status !== "passed") process.exitCode = 1;
	if (result?.status === "passed" && shutdownMarker) {
		await writeFile(shutdownMarker, "shutdown requested\n");
		const acknowledgement = await waitForFile(
			`${shutdownMarker.replace(/\.[^/.]+$/, "")}.ack`,
		);
		const duringDrain = await client.send("Runtime.evaluate", {
			expression: `(async () => {
                const existingSession = await window.__shutdownProbe.existingRequest();
                window.__thirdSessionResult = window.__shutdownProbe.thirdSession();
                return existingSession;
            })()`,
			awaitPromise: true,
			returnByValue: true,
		});
		await delay(5500);
		const afterDeadline = await client.send("Runtime.evaluate", {
			expression: `(async () => ({
                existingSession: await window.__shutdownProbe.existingRequest(),
                thirdSession: await window.__thirdSessionResult,
            }))()`,
			awaitPromise: true,
			returnByValue: true,
		});
		const shutdownResult = {
			status:
				duringDrain.result.value === "succeeded" &&
				afterDeadline.result.value.existingSession === "rejected" &&
				afterDeadline.result.value.thirdSession === "rejected"
					? "passed"
					: "failed",
			acknowledgement: acknowledgement.trim(),
			duringDrainExistingSession: duringDrain.result.value,
			afterDeadlineExistingSession: afterDeadline.result.value.existingSession,
			postShutdownThirdSession: afterDeadline.result.value.thirdSession,
		};
		console.log(`BROWSER_SHUTDOWN_EVIDENCE=${JSON.stringify(shutdownResult)}`);
		if (shutdownResult.status !== "passed") process.exitCode = 1;
	}
} catch (error) {
	console.error(`BROWSER_RUNNER_ERROR=${error.stack ?? error}`);
	console.error(chromiumErrors);
	process.exitCode = 1;
} finally {
	client?.close();
	if (!browserExit.exited) {
		chromium.kill("SIGTERM");
		await new Promise((resolve) => chromium.once("exit", resolve));
	}
	httpServer.close();
	await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
