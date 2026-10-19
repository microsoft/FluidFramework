/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { copyInventory, copyDocument } from "./copy.mjs";
import { fixture } from "./fixtures.mjs";
import { RESULTS_FILE_NAME, writeStageResults } from "../configuration/results.mjs";
import { CredentialError } from "../configuration/credentials.mjs";

async function directory(t) {
	const result = await mkdtemp(path.join(os.tmpdir(), "selfhost-copy-test-"));
	t.after(() => rm(result, { recursive: true, force: true }));
	return result;
}

test("reuses each tenant key once, scopes fresh JWTs correctly, bounds workers and preserves counter state", async (t) => {
	for (const concurrency of [1, 2, 4]) {
		const f = fixture({ tenants: 2, documents: 5, latencyMs: 2 });
		const outcome = await copyInventory(
			{ ...f, resultsDirectory: await directory(t), options: { concurrency } },
			f.dependencies,
		);
		assert.equal(outcome.copied, 10);
		assert.equal(outcome.failed, 0);
		assert.equal(outcome.results.metrics.peakWorkers, concurrency);
		assert.equal(f.acquired.length, 4);
		assert.deepEqual([...f.acquired].sort(), [...f.released].sort());
		assert.equal(f.activeKeys.size, 0);
		for (const [id, body] of f.created) {
			assert.ok(id.endsWith(body.id));
			assert.equal(JSON.parse(body.summary.entries[0].value.content).value, 7);
		}
		const reads = f.events.filter((event) => event.claims.documentId);
		assert.equal(new Set(reads.map((event) => event.claims.jti)).size, reads.length);
		for (const event of reads) assert.match(event.claims.documentId, /^doc-/);
		for (const event of reads) assert.equal(event.claims.exp - event.claims.iat, 60);
		const saved = JSON.stringify(outcome.results);
		assert.doesNotMatch(saved, /fixture-key-|Authorization|eyJhbGci/);
		assert.equal(outcome.results.metrics.stages["source-key"].count, 2);
		assert.equal(outcome.results.metrics.stages["destination-key"].count, 2);
	}
});

test("payload reservations reduce effective workers and oversized summaries never create documents", async (t) => {
	const f = fixture();
	let outcome = await copyInventory(
		{
			...f,
			resultsDirectory: await directory(t),
			options: { concurrency: 4, memoryBudgetBytes: 128 * 1024 ** 2 },
		},
		f.dependencies,
	);
	assert.equal(outcome.results.metrics.peakWorkers, 1);
	const g = fixture({ documents: 2 });
	outcome = await copyInventory(
		{ ...g, resultsDirectory: await directory(t), options: { maxSummaryBytes: 100 } },
		g.dependencies,
	);
	assert.equal(outcome.failed, 2);
	assert.equal(g.created.size, 0);
	assert.ok(
		outcome.results.tenants["source-1"].failed.every(
			(failure) => failure.reason === "payload-too-large",
		),
	);
});

test("failed-only retries only failed documents, retains successes/stages/history, and validates mappings before credentials", async (t) => {
	const f = fixture({ documents: 3 });
	const root = await directory(t);
	const original = f.dependencies.fetchImplementation;
	let failing = true;
	f.dependencies.fetchImplementation = (url, options) => {
		if (failing && url.includes("/session/doc-1-1"))
			return Response.json({ code: "DocumentDeleted" }, { status: 404 });
		return original(url, options);
	};
	const first = await copyInventory({ ...f, resultsDirectory: root }, f.dependencies);
	assert.equal(first.failed, 1);
	await writeStageResults(root, "tenant-creation", { preserved: true });
	const reviewed = path.join(root, "reviewed.json");
	await writeFile(reviewed, await readFile(path.join(root, RESULTS_FILE_NAME)));
	failing = false;
	f.events.length = 0;
	const target = await directory(t);
	const second = await copyInventory(
		{ ...f, resultsDirectory: target, options: { failedOnly: reviewed, concurrency: 4 } },
		f.dependencies,
	);
	assert.equal(second.copied, 3);
	assert.equal(second.failed, 0);
	assert.equal(f.events.filter((event) => event.method === "POST").length, 1);
	assert.equal(second.results.history["source-1"]["doc-1-1"].length, 2);
	assert.equal(
		JSON.parse(await readFile(path.join(target, RESULTS_FILE_NAME), "utf8")).stages[
			"tenant-creation"
		].preserved,
		true,
	);
	f.config.selfHost.alfredEndpoint = "https://different.example";
	const before = f.acquired.length;
	await assert.rejects(
		copyInventory(
			{ ...f, resultsDirectory: root, options: { failedOnly: reviewed } },
			f.dependencies,
		),
		/mapping differs/,
	);
	assert.equal(f.acquired.length, before);
});

test("credential failures release leases and record one failure per affected document", async (t) => {
	for (const scope of ["sourceKey", "destinationKey"]) {
		const f = fixture({ documents: 3 });
		f.dependencies[scope] = async () => {
			throw new CredentialError("Controlled credential failure");
		};
		const outcome = await copyInventory(
			{ ...f, resultsDirectory: await directory(t) },
			f.dependencies,
		);
		assert.equal(outcome.failed, 3);
		assert.equal(f.activeKeys.size, 0);
		assert.equal(f.created.size, 0);
	}
});

test("fatal persistence errors stop assigning work and leave unfinished documents resumable", async (t) => {
	const f = fixture({ documents: 5 });
	const root = await directory(t);
	let saves = 0;
	f.dependencies.persist = async (...args) => {
		if (++saves === 2) throw new Error("disk failure");
		return writeStageResults(...args);
	};
	await assert.rejects(
		copyInventory({ ...f, resultsDirectory: root }, f.dependencies),
		/persistence failed/,
	);
	assert.equal(f.created.size, 1);
	assert.equal(f.activeKeys.size, 0);
	const saved = JSON.parse(await readFile(path.join(root, RESULTS_FILE_NAME), "utf8")).stages[
		"document-copy"
	];
	assert.equal(saved.tenants["source-1"].failed.length, 5);
	assert.ok(
		saved.tenants["source-1"].failed.every((failure) => failure.reason === "interrupted"),
	);
});

test("an uncertain POST is reconciled but never repeated or declared state-verified", async (t) => {
	for (const visible of [true, false]) {
		const f = fixture({ documents: 1 });
		const original = f.dependencies.fetchImplementation;
		let posts = 0;
		f.dependencies.fetchImplementation = async (url, options) => {
			if (options.method === "POST") {
				posts++;
				if (visible) await original(url, options);
				throw Object.assign(new TypeError("not retained"), { cause: { code: "ECONNRESET" } });
			}
			return original(url, options);
		};
		const root = await directory(t);
		const outcome = await copyInventory({ ...f, resultsDirectory: root }, f.dependencies);
		assert.equal(posts, 1);
		assert.equal(outcome.failed, 1);
		assert.equal(outcome.results.tenants["source-1"].failed[0].reason, "ambiguous-create");
		const resumed = await copyInventory(
			{
				...f,
				resultsDirectory: root,
				options: { failedOnly: path.join(root, RESULTS_FILE_NAME) },
			},
			f.dependencies,
		);
		assert.equal(resumed.failed, 1);
		assert.equal(posts, 1);
	}
});

test("unexpected create statuses and invalid success bodies never cause duplicate POSTs, including on resume", async (t) => {
	for (const mode of [
		"server-error",
		"missing-id",
		"mismatched-id",
		"malformed",
		"oversized",
	]) {
		const f = fixture({ documents: 1 });
		const root = await directory(t);
		const original = f.dependencies.fetchImplementation;
		let posts = 0;
		f.dependencies.fetchImplementation = async (url, options) => {
			if (options.method !== "POST") return original(url, options);
			posts++;
			if (mode === "server-error") return Response.json({}, { status: 501 });
			if (mode === "missing-id") return Response.json({}, { status: 201 });
			if (mode === "mismatched-id")
				return Response.json({ id: "different-id" }, { status: 201 });
			return new Response(mode === "oversized" ? "x".repeat(5000) : "{", { status: 201 });
		};
		const outcome = await copyInventory(
			{ ...f, resultsDirectory: root, options: { maxSummaryBytes: 4096 } },
			f.dependencies,
		);
		assert.equal(outcome.failed, 1);
		assert.equal(
			outcome.results.tenants["source-1"].failed[0].reason,
			mode === "mismatched-id" ? "document-id-mismatch" : "ambiguous-create",
		);
		const resumed = await copyInventory(
			{
				...f,
				resultsDirectory: root,
				options: { failedOnly: path.join(root, RESULTS_FILE_NAME) },
			},
			f.dependencies,
		);
		assert.equal(resumed.failed, 1);
		assert.equal(posts, 1);
		assert.equal(f.created.size, 0);
	}
});

test("an all-existing tenant never acquires its source key or claims verified data", async (t) => {
	const f = fixture({ documents: 2 });
	await copyInventory({ ...f, resultsDirectory: await directory(t) }, f.dependencies);
	f.acquired.length = 0;
	const outcome = await copyInventory(
		{ ...f, resultsDirectory: await directory(t) },
		f.dependencies,
	);
	assert.equal(outcome.copied, 0);
	assert.equal(outcome.skipped, 2);
	assert.equal(outcome.failed, 0);
	assert.deepEqual(f.acquired, ["destination:destination-1"]);
	assert.ok(
		outcome.results.tenants["source-1"].warnings.every((warning) =>
			/NOT verified/.test(warning.message),
		),
	);
});

test("a rejected create is retried only after proving the requested ID is absent", async () => {
	const f = fixture({ documents: 1 });
	const original = f.dependencies.fetchImplementation;
	let posts = 0;
	const result = await copyDocument({
		azureFluidRelayEndpoint: "https://discovery.example",
		azureFluidRelayTenantId: "source-1",
		selfHostEndpoint: "https://alfred.example",
		selfHostTenantId: "destination-1",
		documentId: "doc-1-0",
		azureFluidRelayKey: "fixture-key-source-1",
		selfHostKey: "fixture-key-destination-1",
		fetchImplementation: async (url, options) => {
			if (options.method === "POST" && ++posts === 1)
				return Response.json({}, { status: 429, headers: { "retry-after": "1" } });
			return original(url, options);
		},
		policy: f.dependencies.retryPolicy,
	});
	assert.equal(result.result, "success");
	assert.equal(posts, 2);
	assert.equal(f.created.size, 1);
});
