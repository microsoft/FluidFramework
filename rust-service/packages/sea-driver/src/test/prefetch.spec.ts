/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	createMemoryService,
	type SeaBlobTreeHint,
	type SeaBlobTreeItem,
	type SeaStream,
} from "@fluidframework/sea-typescript/internal";

import { SeaSessionDriverClient, type SeaSessionDriverOptions } from "../index.js";

const hint: SeaBlobTreeHint = { includeDescendantBlobs: true, maxExtraItems: 256 };
const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

describe("SEA opening content", () => {
	async function fixture(
		options: SeaSessionDriverOptions = { loadingHint: hint },
		content?: (stream: SeaStream<SeaBlobTreeItem>) => SeaStream<SeaBlobTreeItem>,
		compressedPayload?: Uint8Array,
	) {
		const compression = compressedPayload !== undefined;
		const service = await createMemoryService({
			environment: "node",
			configuration: compression ? "memory-compression" : "memory",
		});
		const writer = await service.open(undefined, { compression });
		const blob = await writer.putBlob(compressedPayload ?? encode("prefetched value"));
		const nested = await writer.putDirectory([{ name: "value", child: blob }]);
		const root = await writer.putDirectory([{ name: "nested", child: nested }]);
		const position = await writer.submit(undefined, encode("initial"));
		const coordination = await writer.coordinateSnapshots("clientSelected");
		await coordination.next();
		await writer.publishSnapshot(undefined, undefined, position, root);
		let requests = 0;
		let loads = 0;
		let openingHint: SeaBlobTreeHint | undefined;
		const client = new SeaSessionDriverClient(
			async (document, sessionOptions) => {
				openingHint = sessionOptions.loadingHint;
				const session = await service.open(document, { ...sessionOptions, compression });
				return {
					...session,
					getSnapshot: async () => assert.fail("startup must not select another snapshot"),
					getBlobTrees: (roots, requestedHint) => {
						requests++;
						return session.getBlobTrees(roots, requestedHint);
					},
					load: async (required, loadingHint) => {
						loads++;
						assert.deepEqual(loadingHint, openingHint);
						const loaded = await session.load(required, loadingHint);
						return { ...loaded, content: content?.(loaded.content) ?? loaded.content };
					},
				};
			},
			"readOnly",
			options,
		);
		await client.openDirectSession(writer.document, new Uint8Array());
		return {
			client,
			blob,
			root,
			requests: () => requests,
			loads: () => loads,
			reopen: () => client.openDirectSession(writer.document, new Uint8Array()),
			close: async () => {
				client.disconnect();
				await client.reconnect();
				coordination.cancel();
				await writer.close();
				service.close();
			},
		};
	}

	it("uses prefetched directories and decoded blobs without another request", async () => {
		const test = await fixture();
		try {
			assert.deepEqual((await test.client.loadDirectSnapshot())?.root, test.root.bytes);
			const entries = await test.client.fetchSummary(test.root.bytes);
			assert.equal(new TextDecoder().decode(entries[0]?.path), "nested/value");
			const value = await test.client.fetchBlob(test.blob.bytes);
			assert.deepEqual(value, encode("prefetched value"));
			value.fill(0);
			assert.deepEqual(
				await test.client.fetchBlob(test.blob.bytes),
				encode("prefetched value"),
			);
			assert.equal(test.requests(), 0);
			assert.equal(test.loads(), 1);
		} finally {
			await test.close();
		}
	});

	it("makes progress when the content stream repeats identities", async () => {
		const test = await fixture(undefined, (stream) => {
			let duplicate: SeaBlobTreeItem | undefined;
			return {
				cancel: () => stream.cancel(),
				next: async () => {
					if (duplicate !== undefined) {
						const item = duplicate;
						duplicate = undefined;
						return item;
					}
					duplicate = await stream.next();
					return duplicate;
				},
			};
		});
		try {
			await test.client.loadDirectSnapshot();
			assert.equal((await test.client.fetchSummary(test.root.bytes)).length, 1);
			assert.deepEqual(
				await test.client.fetchBlob(test.blob.bytes),
				encode("prefetched value"),
			);
			assert.equal(test.requests(), 0);
		} finally {
			await test.close();
		}
	});

	for (const contentCacheObjects of [0, 1]) {
		it(`falls back for evicted content with a ${contentCacheObjects}-object budget`, async () => {
			const test = await fixture({ loadingHint: hint, contentCacheObjects });
			try {
				await test.client.loadDirectSnapshot();
				assert.equal((await test.client.fetchSummary(test.root.bytes)).length, 1);
				assert.deepEqual(
					await test.client.fetchBlob(test.blob.bytes),
					encode("prefetched value"),
				);
				assert.ok(test.requests() > 0);
			} finally {
				await test.close();
			}
		});
	}

	it("falls back for missing descendants and items above the byte budget", async () => {
		const test = await fixture({ loadingHint: {}, contentCacheBytes: 1 });
		try {
			await test.client.loadDirectSnapshot();
			assert.equal((await test.client.fetchSummary(test.root.bytes)).length, 1);
			await test.client.fetchBlob(test.blob.bytes);
			assert.equal(test.requests(), 3);
		} finally {
			await test.close();
		}
	});

	it("bounds decoded blob bytes even when stored compressed content is small", async () => {
		const payload = encode("compressible content ".repeat(1000));
		const test = await fixture(
			{ loadingHint: hint, contentCacheBytes: 1024 },
			undefined,
			payload,
		);
		try {
			await test.client.loadDirectSnapshot();
			assert.deepEqual(await test.client.fetchBlob(test.blob.bytes), payload);
			assert.deepEqual(await test.client.fetchBlob(test.blob.bytes), payload);
			assert.equal(test.requests(), 2, "oversized decoded blobs must not enter the cache");
		} finally {
			await test.close();
		}
	});

	it("surfaces content failures rather than silently fetching around them", async () => {
		const failure = new Error("prefetch failed");
		const test = await fixture(undefined, (stream) => ({
			cancel: () => stream.cancel(),
			next: async () => {
				throw failure;
			},
		}));
		try {
			await assert.rejects(test.client.loadDirectSnapshot(), (error) => error === failure);
			await assert.rejects(
				test.client.fetchBlob(test.blob.bytes),
				(error) => error === failure,
			);
			assert.equal(test.requests(), 0);
		} finally {
			await test.close();
		}
	});

	it("surfaces a late content failure through a pending live subscription", async () => {
		const failure = new Error("late prefetch failure");
		let reject: (error: Error) => void = () => {};
		const pending = new Promise<undefined>((_resolve, fail) => {
			reject = fail;
		});
		const test = await fixture(undefined, (stream) => ({
			next: () => pending,
			cancel: () => stream.cancel(),
		}));
		try {
			await test.client.loadDirectSnapshot();
			await test.client.readProjected();
			const subscription = await test.client.subscribeProjected();
			const reading = subscription.next();
			reject(failure);
			await assert.rejects(reading, (error) => error === failure);
			subscription.cancel();
		} finally {
			await test.close();
		}
	});

	it("clears retained content when recovery replaces membership", async () => {
		let omitContent = false;
		const test = await fixture(undefined, (stream) => {
			if (!omitContent) return stream;
			stream.cancel();
			return { next: async () => undefined, cancel: () => {} };
		});
		try {
			await test.client.loadDirectSnapshot();
			await test.client.fetchBlob(test.blob.bytes);
			assert.equal(test.requests(), 0);
			omitContent = true;
			await test.reopen();
			await test.client.loadDirectSnapshot();
			assert.deepEqual(
				await test.client.fetchBlob(test.blob.bytes),
				encode("prefetched value"),
			);
			assert.equal(test.requests(), 1);
		} finally {
			await test.close();
		}
	});

	it("does not let stale subscription cancellation stop replacement prefetch", async () => {
		const cancelled: boolean[] = [];
		const test = await fixture(undefined, (stream) => {
			const index = cancelled.length;
			cancelled.push(false);
			let settle: (value: undefined) => void = () => {};
			const pending = new Promise<undefined>((resolve) => {
				settle = resolve;
			});
			return {
				next: () => pending,
				cancel: () => {
					cancelled[index] = true;
					stream.cancel();
					settle(undefined);
				},
			};
		});
		try {
			await test.client.loadDirectSnapshot();
			await test.client.readProjected();
			const old = await test.client.subscribeProjected();
			await test.reopen();
			await test.client.loadDirectSnapshot();
			old.cancel();
			assert.deepEqual(cancelled, [true, false]);
		} finally {
			await test.close();
		}
	});

	it("delivers events while content is pending and cancels content on disconnect", async () => {
		let cancelled = false;
		let settle: (value: undefined) => void = () => {};
		const pending = new Promise<undefined>((resolve) => {
			settle = resolve;
		});
		const test = await fixture(undefined, (stream) => ({
			next: () => pending,
			cancel: () => {
				cancelled = true;
				stream.cancel();
				settle(undefined);
			},
		}));
		try {
			await test.client.loadDirectSnapshot();
			await test.client.readProjected();
			const subscription = await test.client.subscribeProjected();
			test.client.disconnect();
			assert.equal(cancelled, true);
			await assert.rejects(subscription.next(), /subscription ended/u);
		} finally {
			await test.close();
		}
	});
});
