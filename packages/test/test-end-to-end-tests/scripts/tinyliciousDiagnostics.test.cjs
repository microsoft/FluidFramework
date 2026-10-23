/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const { test } = require("node:test");
const { installDiagnostics } = require("./tinyliciousDiagnostics.cjs");

test("diagnostics correlate Git and HTTP work without changing results or logging payloads", async (t) => {
	const records = [];
	const git = Object.fromEntries(
		[
			"writeBlob",
			"readBlob",
			"writeTree",
			"readTree",
			"resolveRef",
			"writeRef",
			"readCommit",
			"writeCommit",
			"walk",
		].map((name) => [name, async () => "result"]),
	);
	const expectedError = Object.assign(new Error("private error message"), {
		code: "TEST_FAILURE",
	});
	git.readBlob = async () => {
		throw expectedError;
	};
	git.writeBlob = async () => {
		await delay(90);
		return "blob-sha";
	};
	const originalWriteBlob = git.writeBlob;
	const originalRequest = http.request;
	const originalEmit = http.Server.prototype.emit;
	const expectedCorrelationId = "92b0d40f-193b-4316-908d-c83e5038b86e";
	const stop = installDiagnostics({
		git,
		tinyliciousVersion: "test-version",
		write: (record) => records.push(record),
		intervalMs: 20,
		slowMs: 50,
	});
	t.after(stop);
	assert.equal(await git.readTree({ dir: __dirname }), "result");
	assert.equal(
		records.some((record) => record.operation === "readTree"),
		false,
	);
	const agent = new http.Agent({ keepAlive: true });
	t.after(() => agent.destroy());
	const upstream = http.createServer(async (_request, response) => {
		await delay(90);
		response.end("upstream-result");
	});
	upstream.listen(0, "127.0.0.1");
	await once(upstream, "listening");
	t.after(() => new Promise((resolve) => upstream.close(resolve)));

	async function get(port, path) {
		const response = await new Promise((resolve, reject) => {
			http.get({ host: "127.0.0.1", port, path, agent }, resolve).on("error", reject);
		});
		let body = "";
		for await (const chunk of response) body += chunk;
		return body;
	}

	const server = http.createServer((_request, response) => {
		(async () => {
			assert.equal(
				await git.writeBlob({ dir: __dirname, blob: "private blob contents" }),
				"blob-sha",
			);
			const result = await new Promise((resolve, reject) => {
				const request = http.request(
					{
						host: "127.0.0.1",
						port: upstream.address().port,
						path: "/upstream?token=private-token",
						agent,
						headers: {
							authorization: "private-authorization",
							"x-correlation-id": expectedCorrelationId,
						},
					},
					async (res) => {
						try {
							let body = "";
							for await (const chunk of res) body += chunk;
							resolve(body);
						} catch (error) {
							reject(error);
						}
					},
				);
				request.on("error", reject);
				request.end();
			});
			response.end(result);
		})().catch((error) => response.destroy(error));
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	t.after(() => new Promise((resolve) => server.close(resolve)));
	assert.equal(
		await get(server.address().port, "/document?secret=private-query"),
		"upstream-result",
	);
	await assert.rejects(git.readBlob({ dir: __dirname }), (error) => error === expectedError);
	await delay(50);

	const gitRecord = records.find(
		(record) => record.event === "operation" && record.operation === "writeBlob",
	);
	assert.ok(gitRecord.durationMs >= 50);
	const inbound = records.find(
		(record) => record.event === "operation" && record.path === "/document",
	);
	assert.equal(gitRecord.requestId, inbound.requestId);
	const outbound = records.find(
		(record) => record.kind === "outbound" && record.path === "/upstream",
	);
	assert.equal(outbound.requestId, inbound.requestId);
	assert.equal(outbound.correlationId, expectedCorrelationId);
	assert.ok(
		records.some(
			(record) => record.kind === "inbound" && record.correlationId === expectedCorrelationId,
		),
	);
	assert.ok(outbound.responseHeadersMs >= 50);
	assert.ok(outbound.socketAssignedMs >= 0);
	assert.equal(outbound.status, 200);
	assert.equal(records.find((record) => record.errorCode === "TEST_FAILURE").failed, true);
	assert.ok(records.some((record) => record.event === "sample" && record.active.git > 0));
	assert.ok(records.some((record) => record.probes?.storageStat?.durationMs >= 0));
	assert.ok(records.some((record) => record.probes?.localhostLookup?.durationMs >= 0));
	assert.equal(records[0].tinyliciousVersion, "test-version");
	assert.doesNotMatch(JSON.stringify(records), /private-/);
	assert.doesNotMatch(JSON.stringify(records), /private blob|private error/);
	stop();
	assert.equal(git.writeBlob, originalWriteBlob);
	assert.equal(http.request, originalRequest);
	assert.equal(http.Server.prototype.emit, originalEmit);
});
