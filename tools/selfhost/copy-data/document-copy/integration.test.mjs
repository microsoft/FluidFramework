/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { once } from "node:events";
import { copyInventory } from "./copy.mjs";
import { fixture } from "./fixtures.mjs";

test("native fetch streams document copies through a local fault-injected HTTP service", async (t) => {
	const f = fixture({ documents: 6 });
	const service = f.dependencies.fetchImplementation;
	const errors = [];
	let throttled = false;
	const server = createServer(async (request, response) => {
		try {
			let body = "";
			for await (const chunk of request) body += chunk;
			if (!throttled && request.url.includes("/session/")) {
				throttled = true;
				response.writeHead(429, { "retry-after": "0", "content-type": "application/json" });
				response.end("{}");
				return;
			}
			const result = await service(`https://fixture.example${request.url}`, {
				method: request.method,
				headers: { Authorization: request.headers.authorization },
				body,
			});
			response.writeHead(result.status, Object.fromEntries(result.headers));
			response.end(await result.text());
		} catch (error) {
			errors.push(error);
			response.writeHead(500);
			response.end("{}");
		}
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	t.after(async () => {
		server.closeAllConnections();
		await new Promise((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	});
	const root = await mkdtemp(path.join(os.tmpdir(), "selfhost-http-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const port = server.address().port;
	f.dependencies.fetchImplementation = (url, options) =>
		fetch(`http://127.0.0.1:${port}${new URL(url).pathname}`, options);
	const outcome = await copyInventory(
		{ ...f, resultsDirectory: root, options: { concurrency: 4 } },
		f.dependencies,
	);
	assert.deepEqual(errors, []);
	assert.equal(outcome.failed, 0);
	assert.equal(outcome.copied, 6);
	assert.equal(outcome.results.metrics.retries, 1);
	assert.equal(f.created.size, 6);
});
