/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { freePort, withChromium } from "../sea-integration-tests/browser/chromium.mjs";

const [siteRoot, transportUrl, certificateHash, shutdownMarker, snapshotPolicyArgument] =
	process.argv.slice(2);
const snapshotPolicy = process.env.SEA_SNAPSHOT_POLICY ?? snapshotPolicyArgument;
const lifecycleWasm = process.env.SEA_BROWSER_LIFECYCLE_WASM;
if (!siteRoot || !transportUrl || !/^[0-9a-f]{64}$/i.test(certificateHash ?? "")) {
	throw new Error(
		"usage: node run-headless.mjs <site-root> <transport-url> <certificate-sha256-hex>",
	);
}

function delay(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
		if (lifecycleWasm && normalized.startsWith("lifecycle/")) {
			const data = await readFile(join(lifecycleWasm, normalized.slice("lifecycle/".length)));
			response.writeHead(200, {
				"content-type": contentTypes.get(extname(normalized)) ?? "application/octet-stream",
			});
			response.end(data);
			return;
		}
		const root = normalized.startsWith("packages/sea-typescript/")
			? resolve(siteRoot, "../..")
			: siteRoot;
		const data = await readFile(join(root, normalized));
		response.writeHead(200, {
			"content-type": contentTypes.get(extname(normalized)) ?? "application/octet-stream",
		});
		response.end(data);
	} catch {
		response.writeHead(404);
		response.end("not found");
	}
});

const httpPort =
	process.env.SEA_BROWSER_HTTP_PORT === undefined
		? await freePort()
		: Number(process.env.SEA_BROWSER_HTTP_PORT);
await new Promise((resolve, reject) => {
	httpServer.once("error", reject);
	httpServer.listen(httpPort, "127.0.0.1", resolve);
});
const pageUrl = `http://localhost:${httpPort}/?transport=${encodeURIComponent(transportUrl)}&hash=${certificateHash}${snapshotPolicy === undefined ? "" : `&snapshotPolicy=${encodeURIComponent(snapshotPolicy)}`}${process.env.SEA_WEBSOCKET_STREAM === "1" ? "&websocket=1" : ""}`;
const browserUrl = new URL(pageUrl);
if (lifecycleWasm) browserUrl.searchParams.set("lifecycle", "1");
if (process.env.SEA_ORDINARY_WEBSOCKET === "1") {
	browserUrl.searchParams.set("ordinaryWebsocket", "1");
}
if (process.env.SEA_BROWSER_WEBTRANSPORT_URL) {
	browserUrl.searchParams.set("primaryTransport", process.env.SEA_BROWSER_WEBTRANSPORT_URL);
}
try {
	await withChromium(browserUrl.href, async (client) => {
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
	});
} catch (error) {
	console.error(`BROWSER_RUNNER_ERROR=${error.stack ?? error}`);
	process.exitCode = 1;
} finally {
	httpServer.closeAllConnections();
	await new Promise((resolve, reject) =>
		httpServer.close((error) => (error ? reject(error) : resolve())),
	);
}
