/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { Deferred } from "@fluidframework/core-utils/internal";

import {
	createMemoryService,
	type SeaBlobTreeHint,
	type SeaBlobTreeItem,
	type SeaStream,
	type SeaTreeId,
} from "@fluidframework/sea-typescript/internal";

import { SeaSessionDriverClient, type SeaSessionDriverOptions } from "../index.js";

const hint: SeaBlobTreeHint = { includeDescendantBlobs: true, maxExtraItems: 256 };
const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

describe("SEA opening content", () => {
	async function fixture(
		options: SeaSessionDriverOptions = { loadingHint: hint },
		content?: (stream: SeaStream<SeaBlobTreeItem>) => SeaStream<SeaBlobTreeItem>,
		compressedPayload?: Uint8Array,
		extra: {
			width?: number;
			depth?: number;
			demand?: (stream: SeaStream<SeaBlobTreeItem>) => SeaStream<SeaBlobTreeItem>;
		} = {},
	) {
		const compression = compressedPayload !== undefined;
		const service = await createMemoryService({
			environment: "node",
			configuration: compression ? "memory-compression" : "memory",
		});
		const writer = await service.open(undefined, { compression });
		const blob = await writer.putBlob(compressedPayload ?? encode("prefetched value"));
		const nested = await writer.putDirectory([{ name: "value", child: blob }]);
		const children = [{ name: "nested", child: nested }];
		for (let index = 1; index < (extra.width ?? 1); index++) {
			const child = await writer.putBlob(encode(`value ${index}`));
			children.push({
				name: `nested${index}`,
				child: await writer.putDirectory([{ name: "value", child }]),
			});
		}
		let root = await writer.putDirectory(children);
		for (let depth = 0; depth < (extra.depth ?? 0); depth++) {
			root = await writer.putDirectory([{ name: "child", child: root }]);
		}
		const position = await writer.submit(undefined, encode("initial"));
		const coordination = await writer.coordinateSnapshots("clientSelected");
		await coordination.next();
		await writer.publishSnapshot(undefined, undefined, position, root);
		let requests = 0;
		const requestedRoots: (readonly SeaTreeId[])[] = [];
		const requestedHints: (SeaBlobTreeHint | undefined)[] = [];
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
						requestedRoots.push(roots);
						requestedHints.push(requestedHint);
						const stream = session.getBlobTrees(roots, requestedHint);
						return extra.demand?.(stream) ?? stream;
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
			requestedRoots,
			requestedHints,
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

	it("coalesces concurrent blob misses in bounded batches without sharing returned buffers", async () => {
		const test = await fixture(
			{ loadingHint: {}, contentCacheObjects: 0 },
			undefined,
			undefined,
			{ width: 40 },
		);
		try {
			await test.client.loadDirectSnapshot();
			const entries = await test.client.fetchSummary(test.root.bytes);
			const before = test.requests();
			const blobs = await Promise.all([
				...entries.map(async (entry) => test.client.fetchBlob(entry.blob)),
				test.client.fetchBlob(test.blob.bytes),
			]);
			assert.deepEqual(
				test.requestedRoots.slice(before).map((roots) => roots.length),
				[16, 16, 8],
			);
			for (const [index, entry] of entries.entries()) {
				const path = new TextDecoder().decode(entry.path);
				const number = path.match(/^nested(\d*)\/value$/u)?.[1];
				assert.notEqual(number, undefined);
				assert.deepEqual(
					blobs[index],
					encode(number === "" ? "prefetched value" : `value ${number}`),
				);
			}
			blobs[0]?.fill(0);
			assert.deepEqual(blobs[40], encode("prefetched value"));
		} finally {
			await test.close();
		}
	});

	it("reports a coalesced content failure to every waiting reader", async () => {
		const failure = new Error("batched blob failed");
		let cancelled = 0;
		const test = await fixture({ loadingHint: {} }, undefined, undefined, {
			demand: (stream) => ({
				next: async () => {
					throw failure;
				},
				cancel: () => {
					cancelled++;
					stream.cancel();
				},
			}),
		});
		try {
			const readers = [
				test.client.fetchBlob(test.blob.bytes),
				test.client.fetchBlob(test.blob.bytes),
			];
			await Promise.all(
				readers.map(async (read) => assert.rejects(read, (error) => error === failure)),
			);
			assert.equal(test.requests(), 1);
			assert.equal(cancelled, 1);
		} finally {
			await test.close();
		}
	});

	for (const contentCacheObjects of [0, 1, 1024]) {
		it(`fetches an explicit blob batch with a ${contentCacheObjects}-object cache`, async () => {
			const test = await fixture(
				{ loadingHint: {}, contentCacheObjects },
				undefined,
				undefined,
				{ width: 600 },
			);
			try {
				await test.client.loadDirectSnapshot();
				const entries = await test.client.fetchSummary(test.root.bytes);
				const before = test.requests();
				const blobs = await test.client.fetchBlobs([
					...entries.map((entry) => entry.blob),
					test.blob.bytes,
				]);
				assert.deepEqual(
					test.requestedRoots.slice(before).map((roots) => roots.length),
					[600],
				);
				for (const [index, entry] of entries.entries()) {
					const number = new TextDecoder()
						.decode(entry.path)
						.match(/^nested(\d*)\/value$/u)?.[1];
					assert.notEqual(number, undefined);
					assert.deepEqual(
						blobs[index],
						encode(number === "" ? "prefetched value" : `value ${number}`),
					);
				}
				blobs[0]?.fill(0);
				assert.deepEqual(blobs[600], encode("prefetched value"));
				const after = test.requests();
				if (contentCacheObjects === 1024) {
					assert.deepEqual(await test.client.fetchBlobs([test.blob.bytes]), [
						encode("prefetched value"),
					]);
					assert.equal(test.requests(), after);
				}
				assert.deepEqual(await test.client.fetchBlobs([]), []);
				assert.equal(test.requests(), after);
			} finally {
				await test.close();
			}
		});
	}

	it("splits explicit blob batches only at the service root limit", async () => {
		const test = await fixture(
			{ loadingHint: {}, contentCacheObjects: 0 },
			undefined,
			undefined,
			{ width: 4100 },
		);
		try {
			const entries = await test.client.fetchSummary(test.root.bytes);
			const before = test.requests();
			assert.equal(
				(await test.client.fetchBlobs(entries.map((entry) => entry.blob))).length,
				4100,
			);
			assert.deepEqual(
				test.requestedRoots.slice(before).map((roots) => roots.length),
				[4096, 4],
			);
		} finally {
			await test.close();
		}
	});

	it("drains an admitted bulk read before disconnect closes its session", async () => {
		const started = new Deferred<void>();
		const release = new Deferred<void>();
		const test = await fixture(
			{ loadingHint: {}, contentCacheObjects: 0 },
			undefined,
			undefined,
			{
				demand: (stream) => ({
					next: async () => {
						started.resolve();
						await release.promise;
						return stream.next();
					},
					cancel: () => stream.cancel(),
				}),
			},
		);
		try {
			const read = test.client.fetchBlobs([test.blob.bytes]);
			await started.promise;
			test.client.disconnect();
			release.resolve();
			assert.deepEqual(await read, [encode("prefetched value")]);
		} finally {
			release.resolve();
			await test.close();
		}
	});

	it("rejects a failed bulk response and cancels its stream", async () => {
		const failure = new Error("bulk read failed");
		let cancelled = false;
		const test = await fixture({ loadingHint: {} }, undefined, undefined, {
			demand: (stream) => ({
				next: async () => {
					throw failure;
				},
				cancel: () => {
					cancelled = true;
					stream.cancel();
				},
			}),
		});
		try {
			await assert.rejects(
				test.client.fetchBlobs([test.blob.bytes]),
				(error) => error === failure,
			);
			assert.equal(cancelled, true);
			assert.equal(test.requests(), 1);
		} finally {
			await test.close();
		}
	});

	it("recovers a wide summary in bounded multi-root requests", async () => {
		const test = await fixture({ loadingHint: {} }, undefined, undefined, { width: 600 });
		try {
			await test.client.loadDirectSnapshot();
			assert.equal((await test.client.fetchSummary(test.root.bytes)).length, 600);
			assert.deepEqual(
				test.requestedRoots.map((roots) => roots.length),
				[600],
			);
		} finally {
			await test.close();
		}
	});

	it("prefetches descendant blobs when recovering missing directories", async () => {
		const loadingHint = { includeDescendantBlobs: true, maxExtraItems: 2 };
		const test = await fixture({ loadingHint }, undefined, undefined, { width: 4 });
		try {
			await test.client.loadDirectSnapshot();
			const entries = await test.client.fetchSummary(test.root.bytes);
			assert.equal(entries.length, 4);
			assert.deepEqual(
				test.requestedRoots.map((roots) => roots.length),
				[2],
			);
			assert.deepEqual(test.requestedHints, [loadingHint]);
			const before = test.requests();
			for (const entry of entries) {
				if (new TextDecoder().decode(entry.path).match(/^nested[23]\//u)) {
					await test.client.fetchBlob(entry.blob);
				}
			}
			assert.equal(test.requests(), before, "recovery must retain descendant payloads");
		} finally {
			await test.close();
		}
	});

	it("loads a deep directory chain without relying on cache retention", async () => {
		const test = await fixture(
			{ loadingHint: {}, contentCacheObjects: 0 },
			undefined,
			undefined,
			{ depth: 40 },
		);
		try {
			await test.client.loadDirectSnapshot();
			const entries = await test.client.fetchSummary(test.root.bytes);
			assert.equal(entries.length, 1);
			assert.equal(
				new TextDecoder().decode(entries[0]?.path),
				`${"child/".repeat(40)}nested/value`,
			);
			assert.equal(test.requests(), 42);
		} finally {
			await test.close();
		}
	});

	for (const contentCacheObjects of [0, 1]) {
		it(`retains requested batch roots with a ${contentCacheObjects}-object cache`, async () => {
			const test = await fixture(
				{ loadingHint: {}, contentCacheObjects },
				undefined,
				undefined,
				{ width: 10 },
			);
			try {
				await test.client.loadDirectSnapshot();
				assert.equal((await test.client.fetchSummary(test.root.bytes)).length, 10);
				assert.deepEqual(
					test.requestedRoots.map((roots) => roots.length),
					contentCacheObjects === 0 ? [1, 10] : [10],
				);
			} finally {
				await test.close();
			}
		});
	}

	it("continues after truncated, duplicated responses without retrying received roots", async () => {
		let cancelled = 0;
		const test = await fixture(
			{ loadingHint: {}, contentCacheObjects: 0 },
			undefined,
			undefined,
			{
				width: 5,
				demand: (stream) => {
					let reads = 0;
					let item: SeaBlobTreeItem | undefined;
					return {
						next: async () => {
							if (reads++ === 0) {
								item = await stream.next();
								return item;
							}
							return reads === 2 ? item : undefined;
						},
						cancel: () => {
							cancelled++;
							stream.cancel();
						},
					};
				},
			},
		);
		try {
			await test.client.loadDirectSnapshot();
			assert.equal((await test.client.fetchSummary(test.root.bytes)).length, 5);
			assert.deepEqual(
				test.requestedRoots.map((roots) => roots.length),
				[1, 5, 4, 3, 2, 1],
			);
			assert.equal(cancelled, 6);
			const before = test.requests();
			const entries = await test.client.fetchSummary(test.root.bytes);
			const blobs = await test.client.fetchBlobs(entries.map((entry) => entry.blob));
			assert.equal(blobs.length, 5);
			assert.deepEqual(
				test.requestedRoots.slice(before + 6).map((roots) => roots.length),
				[5, 4, 3, 2, 1],
			);
		} finally {
			await test.close();
		}
	});

	it("rejects an empty demand response instead of retrying forever", async () => {
		let cancelled = 0;
		const test = await fixture({ loadingHint: {} }, undefined, undefined, {
			demand: (stream) => ({
				next: async () => undefined,
				cancel: () => {
					cancelled++;
					stream.cancel();
				},
			}),
		});
		try {
			await test.client.loadDirectSnapshot();
			await assert.rejects(
				test.client.fetchSummary(test.root.bytes),
				/omitted its requested root/,
			);
			assert.equal(test.requests(), 1);
			assert.equal(cancelled, 1);
		} finally {
			await test.close();
		}
	});

	it("cancels a failed batch and does not issue further requests", async () => {
		const failure = new Error("demand failed");
		let requests = 0;
		let cancelled = 0;
		const test = await fixture({ loadingHint: {} }, undefined, undefined, {
			width: 9000,
			demand: (stream) => {
				const fail = ++requests === 2;
				let first = true;
				return {
					next: async () => {
						if (fail && !first) throw failure;
						first = false;
						return stream.next();
					},
					cancel: () => {
						cancelled++;
						stream.cancel();
					},
				};
			},
		});
		try {
			await test.client.loadDirectSnapshot();
			await assert.rejects(
				test.client.fetchSummary(test.root.bytes),
				(error) => error === failure,
			);
			assert.equal(requests, 2);
			assert.equal(cancelled, 2);
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
