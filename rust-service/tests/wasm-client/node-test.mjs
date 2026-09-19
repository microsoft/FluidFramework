/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import "../../packages/sea-typescript/test/session.test.mjs";

const require = createRequire(import.meta.url);
const {
	SeaInjectedClient,
	SeaLocalService,
	SeaSnapshotParticipation,
} = require("../../crates/sea-webtransport/test-support/pkg/node/sea_webtransport_test_support.js");
const encoder = new TextEncoder();

/** Owns the generated objects retained by the legacy registration regression. */
async function clients(context) {
	const service = await SeaLocalService.create();
	const first = service.connect();
	context.after(async () => {
		await first.close();
		first.free();
		service.free();
	});
	await first.createDocument(encoder.encode("first-author"), encoder.encode("first-session"));
	const snapshots = await first.subscribeSnapshots(SeaSnapshotParticipation.ClientSelected);
	await snapshots.next();
	context.after(async () => {
		await snapshots.cancel();
		snapshots.free();
	});
	return { first, snapshots };
}

test("generated injected clients allow an omitted disconnect hook", () => {
	const openBidirectional = () => {
		throw new Error("disconnect must not open a stream");
	};
	const withoutDisconnect = new SeaInjectedClient({ openBidirectional }, 1024 * 1024);
	assert.doesNotThrow(() => withoutDisconnect.disconnect());

	const withFailingDisconnect = new SeaInjectedClient(
		{
			openBidirectional,
			disconnect: () => {
				throw new Error("injected disconnect failed");
			},
		},
		1024 * 1024,
	);
	assert.throws(() => withFailingDisconnect.disconnect(), /injected disconnect failed/);
	withoutDisconnect.free();
	withFailingDisconnect.free();
});

test("legacy named-create input is rejected instead of opening an existing archive", async (context) => {
	const service = await SeaLocalService.create();
	const creator = service.connect();
	const named = service.connect();
	context.after(async () => {
		await creator.close();
		creator.free();
		named.free();
		service.free();
	});
	const allocated = await creator.createDocument(
		encoder.encode("creator"),
		encoder.encode("creator-session"),
	);
	await assert.rejects(
		named.openSession(
			allocated,
			true,
			encoder.encode("named"),
			encoder.encode("named-session"),
		),
		/does not accept/,
	);
});

test("legacy snapshot replacement and cancellation release only their own registration", async (context) => {
	const { first, snapshots } = await clients(context);
	const pending = assert.rejects(snapshots.next(), /cancelled/);
	const replacement = await first.subscribeSnapshots(SeaSnapshotParticipation.ClientSelected);
	context.after(async () => {
		await replacement.cancel();
		replacement.free();
	});
	await pending;
	await replacement.next();
	await snapshots.cancel();
	const root = await first.putBlob(encoder.encode("state"));
	const position = await first.submit(
		encoder.encode("initial"),
		undefined,
		encoder.encode("state"),
		root,
	);
	const notification = replacement.next();
	await first.publishSnapshot(undefined, position, root);
	assert.equal((await notification).latest, position);
	const cancelled = assert.rejects(replacement.next(), /cancelled/);
	await replacement.cancel();
	await cancelled;
	await assert.rejects(first.publishSnapshot(undefined, position, root), /not open/);
});
