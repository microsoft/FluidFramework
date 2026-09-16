/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { SeaDirectoryEntry, SeaLocalService } = require("./pkg/sea_webtransport.js");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function clients() {
	const service = await SeaLocalService.create();
	const first = service.connect();
	const second = service.connect();
	const archive = encoder.encode("node-archive");
	await first.openSession(archive, encoder.encode("first-author"), encoder.encode("first-session"));
	return { archive, first, second };
}

test("generated local clients submit, resolve, read, and tail events", async () => {
	const { archive, first, second } = await clients();
	const firstReceipt = await first.submit(
		encoder.encode("operation-one"),
		undefined,
		encoder.encode("first"),
	);
	assert.equal(
		(await first.resolveSubmission(encoder.encode("operation-one"))).position,
		firstReceipt.position,
	);
	const load = await first.load();
	assert.equal(decoder.decode((await load.next()).payload), "first");
	assert.equal((await load.next()).kind, "caughtUp");
	await second.openSession(
		archive,
		encoder.encode("second-author"),
		encoder.encode("second-session"),
		firstReceipt.position,
	);
	await second.submit(
		encoder.encode("operation-two"),
		firstReceipt.position,
		encoder.encode("second"),
	);
	assert.equal(decoder.decode((await load.next()).payload), "second");
	await load.cancel();
});

test("generated local clients preserve recursive content and snapshot identities", async () => {
	const { first } = await clients();
	const blob = await first.putBlob(encoder.encode("content"));
	assert.equal(decoder.decode(await first.getBlob(blob)), "content");
	const child = await first.putDirectory([new SeaDirectoryEntry("leaf", blob)]);
	const root = await first.putDirectory([new SeaDirectoryEntry("child", child)]);
	const entries = await first.getDirectory(root);
	assert.equal(entries.length, 1);
	assert.equal(entries[0].name, "child");
	const snapshot = await first.publishSnapshot(
		encoder.encode("snapshot-operation"),
		undefined,
		undefined,
		root,
	);
	assert.deepEqual((await first.latestSnapshot()).id, snapshot.id);
	assert.deepEqual((await first.getSnapshot(snapshot.id)).root.bytes, root.bytes);
});

test("generated local clients reject stable identity conflicts and stale sessions", async () => {
	const { archive, first } = await clients();
	await first.submit(encoder.encode("same"), undefined, encoder.encode("first"));
	await assert.rejects(
		first.submit(encoder.encode("same"), undefined, encoder.encode("different")),
		/operation identity is already bound/,
	);
	await first.openSession(
		archive,
		encoder.encode("first-author"),
		encoder.encode("replacement-session"),
	);
	await assert.rejects(
		first.openSession(
			archive,
			encoder.encode("first-author"),
			encoder.encode("first-session"),
		),
		/session identity was already used/,
	);
});

test("generated local clients expose disconnect and explicit reopen", async () => {
	const { archive, first } = await clients();
	first.disconnect();
	await assert.rejects(first.latestSnapshot(), /disconnected/);
	await first.openSession(
		archive,
		encoder.encode("first-author"),
		encoder.encode("reconnected-session"),
	);
	assert.equal(await first.latestSnapshot(), undefined);
});
