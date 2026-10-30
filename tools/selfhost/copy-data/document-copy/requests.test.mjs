/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { requestJson } from "./requests.mjs";

const url = "https://service.example";
const policy = { sleep: async () => {}, random: () => 0.5 };

test("HTTP retry matrix preserves safe status/code distinctions without response messages", async () => {
	for (const [status, body, reason, calls] of [
		[403, {}, "authentication", 1],
		[404, {}, "not-found", 1],
		[404, { code: "DocumentDeleted" }, "deleted", 1],
		[400, { error: { code: "RepositoryNotFound" } }, "missing-summary", 1],
		[400, { code: "unknown-secret-value", message: "secret-value" }, "http-error", 1],
		[429, {}, "throttled", 3],
		[503, {}, "server-error", 3],
		[408, {}, "timeout", 3],
		[500, {}, "server-error", 3],
		[501, {}, "server-error", 1],
	]) {
		let count = 0;
		await assert.rejects(
			requestJson(
				url,
				() => "not-retained",
				"self-host",
				async () => {
					count++;
					return Response.json(body, { status });
				},
				{ policy },
			),
			(error) => {
				assert.equal(error.reason, reason);
				assert.equal(error.status, status);
				assert.doesNotMatch(JSON.stringify(error), /secret-value/);
				return true;
			},
		);
		assert.equal(count, calls);
	}
});

test("mints authorization per retry and honours numeric and date Retry-After", async () => {
	for (const hint of ["2", new Date(Date.now() + 5000).toUTCString()]) {
		const waits = [];
		let minted = 0;
		const value = await requestJson(
			url,
			() => `${++minted}`,
			"self-host",
			async (_, options) =>
				options.headers.Authorization === "1"
					? Response.json({}, { status: 429, headers: { "retry-after": hint } })
					: Response.json({ ok: true }),
			{ policy: { ...policy, sleep: async (ms) => waits.push(ms) } },
		);
		assert.deepEqual(value, { ok: true });
		assert.equal(minted, 2);
		assert.ok(waits[0] >= (hint === "2" ? 2000 : 3000));
	}
});

test("bounds streamed bodies even without Content-Length and never retries oversized or malformed JSON", async () => {
	for (const response of [
		() => new Response("x".repeat(11)),
		() => new Response("{"),
		() => new Response("{}", { headers: { "content-length": "100" } }),
	]) {
		let count = 0;
		await assert.rejects(
			requestJson(
				url,
				() => "",
				"self-host",
				async () => {
					count++;
					return response();
				},
				{ maxBytes: 10, policy },
			),
		);
		assert.equal(count, 1);
	}
});

test("deadlines cover hanging fetches and body reads and exhaust the retry budget", async () => {
	for (const fetcher of [
		async () => new Promise(() => {}),
		async () => new Response(new ReadableStream({ start() {} })),
	]) {
		let count = 0;
		await assert.rejects(
			requestJson(
				url,
				() => "",
				"self-host",
				async (...args) => {
					count++;
					return fetcher(...args);
				},
				{ policy: { ...policy, attempts: 2, timeoutMs: 5 } },
			),
			(error) => error.reason === "timeout",
		);
		assert.equal(count, 2);
	}
});

test("transport resets retry with fresh authorization and preserve a safe attempt history", async () => {
	const events = [];
	let tokens = 0;
	await assert.rejects(
		requestJson(
			url,
			() => `${++tokens}`,
			"self-host",
			async () => {
				throw Object.assign(new TypeError("secret transport metadata"), {
					cause: { code: "ECONNRESET" },
				});
			},
			{ policy, onAttempt: (event) => events.push(event) },
		),
		(error) => {
			assert.equal(error.reason, "network");
			assert.equal(error.attempts, 3);
			assert.doesNotMatch(JSON.stringify(error), /secret/);
			return true;
		},
	);
	assert.equal(tokens, 3);
	assert.deepEqual(
		events.map((event) => event.attempt),
		[1, 2, 3],
	);
});

test("enforces the exact decoded UTF-8 byte boundary, not a character count", async () => {
	const text = "\u00e9\u00e9\u00e9\u00e9";
	assert.equal(Buffer.byteLength(JSON.stringify(text)), 10);
	assert.equal(
		await requestJson(
			url,
			() => "",
			"self-host",
			async () => new Response(JSON.stringify(text)),
			{ maxBytes: 10 },
		),
		text,
	);
	await assert.rejects(
		requestJson(
			url,
			() => "",
			"self-host",
			async () => new Response(JSON.stringify(`${text}a`)),
			{ maxBytes: 10 },
		),
		(error) => error.reason === "payload-too-large",
	);
});
