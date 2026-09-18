/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemoryService } from "@fluidframework/sea-typescript/internal";

const encode = (text) => new TextEncoder().encode(text);

for (const compression of [false, true]) {
	test(`package entrypoint supports shared memory sessions (compression=${compression})`, async () => {
		const configuration = compression ? "memory-compression" : "memory";
		const service = await createMemoryService({ configuration, environment: "node" });
		const isolated = await createMemoryService({ configuration, environment: "node" });
		const writer = await service.open(undefined, {
			author: encode("writer"),
			session: encode("writer-session"),
			compression,
		});
		const reader = await service.open(writer.document, {
			author: encode("reader"),
			session: encode("reader-session"),
			compression,
		});
		try {
			await assert.rejects(
				isolated.open(writer.document, {
					author: encode("isolated"),
					session: encode("isolated-session"),
					compression,
				}),
				/does not exist/,
			);
			const payload = encode("opaque application payload ".repeat(100));
			const blob = await writer.putBlob(payload);
			assert.deepEqual(await reader.getBlob(blob), payload);
			if (compression) {
				const rawReader = await service.open(writer.document, {
					author: encode("raw-reader"),
					session: encode("raw-reader-session"),
				});
				try {
					const stored = await rawReader.getBlob(blob);
					assert.notDeepEqual(stored, payload);
					assert.ok(stored.length < payload.length);
				} finally {
					await rawReader.close();
				}
			}
			const root = await writer.putDirectory([{ name: "state", child: blob }]);
			assert.deepEqual(await reader.getDirectory(root), [{ name: "state", child: blob }]);
			const position = await writer.submit(encode("operation"), undefined, payload);
			assert.equal(await writer.resolveSubmission(encode("operation")), position);
			const events = reader.read(undefined, position);
			let observed = false;
			for (;;) {
				const item = await events.next();
				if (item === undefined) {
					break;
				}
				if (item.kind === "event") {
					assert.deepEqual(item.payload, payload);
					observed = true;
				}
			}
			assert.ok(observed);
			const coordination = await writer.coordinateSnapshots("clientSelected");
			await coordination.next();
			await writer.publishSnapshot(undefined, undefined, position, root);
			const loaded = await reader.load();
			const snapshot = await loaded.next();
			assert.equal(snapshot.kind, "snapshot");
			assert.equal(snapshot.atEvent, position);
			assert.deepEqual(snapshot.root, root);
			loaded.cancel();
			coordination.cancel();
			const pendingStream = reader.read(position);
			while ((await pendingStream.next()).kind !== "progress") {}
			const pending = pendingStream.next();
			pendingStream.cancel();
			assert.equal(await pending, undefined);
		} finally {
			await writer.close();
			await reader.close();
			service.close();
			isolated.close();
		}
	});
}

test("minimal memory bundle rejects unavailable compression before creating a document", async () => {
	const service = await createMemoryService({ environment: "node" });
	try {
		await assert.rejects(
			service.open(undefined, {
				author: encode("writer"),
				session: encode("session"),
				compression: true,
			}),
			/does not support compression/,
		);
	} finally {
		service.close();
	}
});
