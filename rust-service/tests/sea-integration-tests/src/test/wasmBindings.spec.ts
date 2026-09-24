/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import { afterEach, describe, it } from "mocha";
import type * as Generated from "../../../../packages/sea-typescript/generated/memory/node/sea_wasm.js";

const bindings = createRequire(import.meta.url)(
	"../../../../packages/sea-typescript/generated/memory/node/sea_wasm.js",
) as typeof Generated;

describe("Generated Rust binding ownership", () => {
	const cleanups: (() => Promise<void>)[] = [];

	afterEach(async () => {
		for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
	});

	/** Opens raw generated sessions so TypeScript wrapper guards cannot satisfy these assertions. */
	async function fixture() {
		const service = new bindings.SeaMemoryService();
		const options = new bindings.SeaSessionOptions(undefined, false);
		const sessions: Generated.SeaSession[] = [];
		cleanups.push(async () => {
			for (const session of sessions) {
				await session.close();
				session.free();
			}
			options.free();
			service.free();
		});
		const open = async (document?: Uint8Array): Promise<Generated.SeaSession> => {
			const session = await service.open(document, options);
			sessions.push(session);
			return session;
		};
		return { open };
	}

	it("rejects concurrent raw event reads and cancels the pending borrow", async () => {
		const { open } = await fixture();
		const session = await open();
		const stream = session.read(undefined, undefined);
		let pending: Promise<unknown> | undefined;
		try {
			for (;;) {
				const progress = await stream.next();
				assert.equal(progress.kind, "progress");
				if (progress.status === "AwaitingNewItems") break;
			}
			pending = stream.next();
			await assert.rejects(stream.next(), { kind: "Rejected" });
			stream.cancel();
			assert.equal(await pending, undefined);
			assert.equal(await stream.next(), undefined);
		} finally {
			stream.cancel();
			await pending;
			stream.free();
		}
	});

	it("session close releases raw signals and wakes their pending borrow without closing peers", async () => {
		const { open } = await fixture();
		const session = await open();
		const peer = await open(session.document);
		const signals = await session.openSignals(new Uint8Array([1]), new Uint8Array([2]));
		let pending: Promise<unknown> | undefined;
		try {
			const initial = await signals.next();
			assert.equal(initial.kind, "members");
			assert.deepEqual(initial.members, [
				{ id: new Uint8Array([1]), metadata: new Uint8Array([2]) },
			]);
			pending = signals.next();
			await session.close();
			assert.equal(await pending, undefined);
			assert.equal(
				typeof (await peer.submit(undefined, new Uint8Array([3]), undefined)),
				"bigint",
			);
		} finally {
			await signals.close();
			await pending;
			signals.free();
		}
	});

	it("rejects malformed raw directory inputs before publishing content", async () => {
		const { open } = await fixture();
		const session = await open();
		const blob = await session.putBlob(new Uint8Array([7]));
		try {
			const child = (): Generated.SeaTreeId => bindings.SeaTreeId.blob(blob.bytes);
			await assert.rejects(session.putDirectory(["a"], []), { kind: "Rejected" });
			await assert.rejects(session.putDirectory(["a", "a"], [child(), child()]), {
				kind: "Rejected",
			});
			await assert.rejects(session.getDirectory(blob), { kind: "Rejected" });
			assert.throws(() => bindings.SeaTreeId.blob(new Uint8Array()), { kind: "Rejected" });
			assert.deepEqual(await session.getBlob(blob), new Uint8Array([7]));
		} finally {
			blob.free();
		}
	});
});
