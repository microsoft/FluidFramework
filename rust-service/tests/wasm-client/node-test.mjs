/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
	SeaDirectoryEntry,
	SeaDurability,
	SeaLoadKind,
	SeaLocalService,
	SeaSnapshotParticipation,
	SeaStreamStatus,
	SeaTreeKind,
} = require("../../crates/sea-webtransport/test-support/pkg/node/sea_webtransport_test_support.js");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function nextEvent(stream) {
	for (;;) {
		const item = await stream.next();
		assert.notEqual(item, undefined);
		if (item.kind === SeaLoadKind.Event) return item;
	}
}

async function nextAwaiting(stream) {
	for (;;) {
		const item = await stream.next();
		assert.notEqual(item, undefined);
		if (
			item.kind === SeaLoadKind.Progress &&
			item.status === SeaStreamStatus.AwaitingNewItems
		) {
			return item;
		}
	}
}

async function clients() {
	const service = await SeaLocalService.create();
	const first = service.connect();
	const second = service.connect();
	const archive = encoder.encode("node-archive");
	await first.openSession(
		archive,
		true,
		encoder.encode("first-author"),
		encoder.encode("first-session"),
	);
	const snapshots = await first.subscribeSnapshots(SeaSnapshotParticipation.ClientSelected);
	await snapshots.next();
	return { archive, first, second };
}

test("generated local clients submit, resolve, read, and tail events", async () => {
	const { archive, first, second } = await clients();
	const firstReceipt = await first.submit(
		encoder.encode("operation-one"),
		undefined,
		encoder.encode("first"),
	);
	assert.equal(firstReceipt.durability, SeaDurability.Memory);
	assert.equal(
		(await first.resolveSubmission(encoder.encode("operation-one"))).position,
		firstReceipt.position,
	);
	const load = await first.load();
	assert.equal(decoder.decode((await nextEvent(load)).payload), "first");
	await nextAwaiting(load);
	await second.openSession(
		archive,
		false,
		encoder.encode("second-author"),
		encoder.encode("second-session"),
		firstReceipt.position,
	);
	await second.submit(
		encoder.encode("operation-two"),
		firstReceipt.position,
		encoder.encode("second"),
	);
	assert.equal(decoder.decode((await nextEvent(load)).payload), "second");
	await load.cancel();
});

test("generated local clients preserve recursive content and snapshot identities", async () => {
	const { first } = await clients();
	const blob = await first.putBlob(encoder.encode("content"));
	assert.equal(blob.kind, SeaTreeKind.Blob);
	assert.equal(decoder.decode(await first.getBlob(blob)), "content");
	const child = await first.putDirectory([new SeaDirectoryEntry("leaf", blob)]);
	const root = await first.putDirectory([new SeaDirectoryEntry("child", child)]);
	assert.equal(root.kind, SeaTreeKind.Directory);
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

test("generated snapshot participation enforces publication authority", async () => {
	const service = await SeaLocalService.create();
	const archive = encoder.encode("snapshot-policy-archive");
	const readOnly = service.connect();
	await readOnly.openSession(
		archive,
		true,
		encoder.encode("read-only-author"),
		encoder.encode("read-only-session"),
	);
	const readOnlySnapshots = await readOnly.subscribeSnapshots(
		SeaSnapshotParticipation.ReadOnly,
	);
	await readOnlySnapshots.next();
	const blob = await readOnly.putBlob(encoder.encode("snapshot-policy-content"));
	await assert.rejects(
		readOnly.publishSnapshot(
			encoder.encode("read-only-publication"),
			undefined,
			undefined,
			blob,
		),
		/read-only/,
	);

	await readOnlySnapshots.cancel();
	await readOnly.close();
	const selected = service.connect();
	await selected.openSession(
		archive,
		false,
		encoder.encode("selected-author"),
		encoder.encode("selected-session"),
	);
	const selectedSnapshots = await selected.subscribeSnapshots(
		SeaSnapshotParticipation.SeaSelected,
	);
	const coordination = await selectedSnapshots.next();
	assert.notEqual(coordination.fence, undefined);
	const snapshot = await selected.publishSnapshot(
		encoder.encode("selected-publication"),
		undefined,
		undefined,
		blob,
	);
	assert.equal(snapshot.root.kind, SeaTreeKind.Blob);
	await selected.close();
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
		false,
		encoder.encode("first-author"),
		encoder.encode("replacement-session"),
	);
	await assert.rejects(
		first.openSession(
			archive,
			false,
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
		false,
		encoder.encode("first-author"),
		encoder.encode("reconnected-session"),
	);
	assert.equal(await first.latestSnapshot(), undefined);
});

test("generated local clients require explicit archive creation", async () => {
	const service = await SeaLocalService.create();
	const archive = encoder.encode("explicit-archive");
	await assert.rejects(
		service
			.connect()
			.openSession(
				archive,
				false,
				encoder.encode("missing-author"),
				encoder.encode("missing-session"),
			),
		/archive does not exist/,
	);
	await service.connect().createArchive(archive);
	await assert.rejects(service.connect().createArchive(archive), /archive already exists/);
	await service
		.connect()
		.openSession(
			archive,
			false,
			encoder.encode("open-author"),
			encoder.encode("open-session"),
		);
});

test("generated local stream cancellation wakes a pending read", async () => {
	const { first } = await clients();
	const load = await first.load();
	await nextAwaiting(load);
	const pending = load.next();
	await load.cancel();
	assert.equal(await pending, undefined);
});
