/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { freePort, withChromium } from "./chromium.mjs";

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

const httpPort =
	process.env.BENCHMARK_HTTP_PORT === undefined
		? await freePort()
		: Number(process.env.BENCHMARK_HTTP_PORT);
if (!Number.isInteger(httpPort) || httpPort < 1 || httpPort > 65535) {
	throw new Error("BENCHMARK_HTTP_PORT must be a valid TCP port");
}
await new Promise((resolve, reject) => {
	server.once("error", reject);
	server.listen(httpPort, "127.0.0.1", resolve);
});
const pageParameters = new URLSearchParams(query);
pageParameters.set("transport", transportUrl);
pageParameters.set("hash", certificateHash);
const pageUrl = `http://localhost:${httpPort}/${page}?${pageParameters}`;
const cpuProfilePath = process.env.BENCHMARK_CPU_PROFILE_PATH;
try {
	await withChromium(
		cpuProfilePath === undefined ? pageUrl : "about:blank",
		async (client) => {
			let cpuProfileStarted = false;
			try {
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
							({ method }) =>
								method === "Runtime.exceptionThrown" || method === "Log.entryAdded",
						)
						.map(({ method, params }) => ({ method, params }));
				}
				console.log(`BROWSER_EVIDENCE=${JSON.stringify(result)}`);
				if (result?.status !== "passed") process.exitCode = 1;
			} finally {
				if (cpuProfileStarted) {
					const { profile: cpuProfile } = await client.send("Profiler.stop");
					await writeFile(cpuProfilePath, JSON.stringify(cpuProfile));
				}
			}
		},
		{ commandTimeoutMilliseconds: benchmarkTimeoutMilliseconds * 2 + 5_000 },
	);
} catch (error) {
	console.error(error.stack ?? error);
	process.exitCode = 1;
} finally {
	server.closeAllConnections();
	await new Promise((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
}
