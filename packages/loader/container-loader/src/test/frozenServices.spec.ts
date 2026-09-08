/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	IClient,
	IDocumentMessage,
	IDocumentService,
	IDocumentServiceFactory,
	IDocumentStorageService,
	INack,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";

import {
	FrozenDeltaStream,
	FrozenDocumentServiceFactory,
	WritableFrozenDeltaStream,
} from "../frozenServices.js";

const fakeUrl = {
	url: "fluid://test",
	tokens: {},
	type: "fluid",
} as unknown as IResolvedUrl;

const fakeReadClient = (): IClient => ({
	mode: "read",
	details: { capabilities: { interactive: true } },
	permission: [],
	user: { id: "test" },
	scopes: [],
});

const fakeOp = (): IDocumentMessage =>
	({
		type: "op",
		clientSequenceNumber: 1,
		referenceSequenceNumber: 0,
		contents: {},
	}) as unknown as IDocumentMessage;

describe("FrozenDeltaStream", () => {
	describe("submit", () => {
		it("emits a nack with code 403 and array payload (read-only variant)", () => {
			const stream = new FrozenDeltaStream();
			const nacks: { clientId: string; messages: INack[] }[] = [];
			stream.on("nack", (clientId, messages) => {
				nacks.push({ clientId, messages });
			});

			const op = fakeOp();
			stream.submit([op]);

			assert.strictEqual(nacks.length, 1, "Expected exactly one nack event");
			const [nack] = nacks;
			assert(Array.isArray(nack.messages), "Expected nack payload to be an array");
			assert.strictEqual(nack.messages.length, 1);
			assert.strictEqual(nack.messages[0].content.code, 403);
			assert.strictEqual(nack.messages[0].operation, op);
		});

		it("emits a nack with code 403 and array payload (writable variant)", () => {
			const stream = new WritableFrozenDeltaStream();
			const nacks: { clientId: string; messages: INack[] }[] = [];
			stream.on("nack", (clientId, messages) => {
				nacks.push({ clientId, messages });
			});

			const op = fakeOp();
			stream.submit([op]);

			assert.strictEqual(nacks.length, 1, "Expected exactly one nack event");
			assert(Array.isArray(nacks[0].messages));
			assert.strictEqual(nacks[0].messages[0].content.code, 403);
		});

		it("nack payload has one entry per submitted op", () => {
			const stream = new FrozenDeltaStream();
			let received: INack[] | undefined;
			stream.on("nack", (_clientId, messages) => {
				received = messages;
			});

			const ops = [fakeOp(), fakeOp(), fakeOp()];
			stream.submit(ops);

			assert(received !== undefined);
			assert.strictEqual(received.length, ops.length);
			for (let i = 0; i < ops.length; i++) {
				assert.strictEqual(received[i].operation, ops[i]);
			}
		});
	});

	describe("submitSignal", () => {
		it("does not emit any event (read-only variant)", () => {
			const stream = new FrozenDeltaStream();
			let eventCount = 0;
			stream.on("nack", () => eventCount++);
			stream.on("op", () => eventCount++);
			stream.on("signal", () => eventCount++);
			stream.on("error", () => eventCount++);

			stream.submitSignal({ type: "test", content: {} });

			assert.strictEqual(eventCount, 0, "Expected submitSignal to be a silent no-op");
		});

		it("does not emit any event (writable variant)", () => {
			const stream = new WritableFrozenDeltaStream();
			let eventCount = 0;
			stream.on("nack", () => eventCount++);

			stream.submitSignal({ type: "test", content: {} });

			assert.strictEqual(eventCount, 0, "Expected submitSignal to be a silent no-op");
		});
	});

	describe("constructor options", () => {
		it("accepts storageOnlyReason on the read-only variant", () => {
			const stream = new FrozenDeltaStream({ storageOnlyReason: "ok" });
			assert.strictEqual(stream.storageOnlyReason, "ok");
		});

		it("accepts readonlyConnectionReason on the read-only variant", () => {
			const reason = { text: "fallback" };
			const stream = new FrozenDeltaStream({ readonlyConnectionReason: reason });
			assert.strictEqual(stream.readonlyConnectionReason, reason);
		});
	});
});

describe("FrozenDocumentService.connectToDeltaStream", () => {
	it("hands out distinct WritableFrozenDeltaStream instances with distinct clientIds on subsequent connects", async () => {
		// Pins the per-instance clientId fix that prevents pendingStateManager's 0x173
		// replay-assert when a writable-frozen container reconnects with dirty pending ops.
		// Each WritableFrozenDeltaStream instance must mint a fresh `frozen-delta-stream/<uuid>`
		// so the runtime sees the clientId change across replays.
		const factory = new FrozenDocumentServiceFactory(false);
		const service = await factory.createDocumentService(fakeUrl);

		const first = await service.connectToDeltaStream(fakeReadClient());
		const second = await service.connectToDeltaStream(fakeReadClient());

		assert(first instanceof WritableFrozenDeltaStream);
		assert(second instanceof WritableFrozenDeltaStream);
		assert.notStrictEqual(
			first,
			second,
			"Expected each subsequent connect to return a fresh WritableFrozenDeltaStream instance",
		);
		assert.match(first.clientId, /^frozen-delta-stream\//);
		assert.match(second.clientId, /^frozen-delta-stream\//);
		assert.notStrictEqual(
			first.clientId,
			second.clientId,
			"Expected each WritableFrozenDeltaStream instance to mint a fresh clientId — sharing it would trip pendingStateManager 0x173 on replay",
		);

		// initialClients must mirror the per-instance clientId so the audience handler
		// observes "self" without waiting for a join op or signal.
		assert.strictEqual(first.initialClients[0]?.clientId, first.clientId);
		assert.strictEqual(second.initialClients[0]?.clientId, second.clientId);
	});
});

describe("FrozenDocumentService disposal", () => {
	it("dispose() rejects in-flight createBlob promises on writable-frozen storage", async () => {
		// The writable-frozen `createBlob` returns a never-resolving promise so the
		// BlobManager keeps the blob in `uploading` state and `getPendingBlobs` captures it
		// in pending state. Without disposal cancelling those hangs, the BlobManager's
		// `.then`/`.catch` handlers retain references to the rejecter for the lifetime of
		// the process. FrozenDocumentService.dispose() must cascade to each storage instance
		// and reject the pending promises.
		const factory = new FrozenDocumentServiceFactory(false);
		const service = await factory.createDocumentService(fakeUrl);
		const storage = await service.connectToStorage();
		assert(storage.createBlob !== undefined, "Expected createBlob to be defined");

		const blob = new Uint8Array([1, 2, 3]).buffer;
		const inFlight = storage.createBlob(blob);

		// Promise.race against a microtask-flush sentinel proves the createBlob promise is
		// hanging (not resolved/rejected) before disposal.
		const sentinel = Symbol("not-settled");
		const racedBeforeDispose = await Promise.race([
			inFlight.then(
				() => "resolved" as const,
				() => "rejected" as const,
			),
			Promise.resolve(sentinel),
		]);
		assert.strictEqual(
			racedBeforeDispose,
			sentinel,
			"Expected createBlob to hang before dispose() is called",
		);

		service.dispose();

		await assert.rejects(
			inFlight,
			(error: Error) => error.message === "FrozenDocumentStorageService is disposed",
			"Expected in-flight createBlob to reject when FrozenDocumentService is disposed",
		);
	});

	it("createBlob calls after disposal reject immediately on writable-frozen storage", async () => {
		const factory = new FrozenDocumentServiceFactory(false);
		const service = await factory.createDocumentService(fakeUrl);
		const storage = await service.connectToStorage();
		assert(storage.createBlob !== undefined, "Expected createBlob to be defined");

		service.dispose();

		await assert.rejects(
			storage.createBlob(new Uint8Array([1]).buffer),
			(error: Error) => error.message === "FrozenDocumentStorageService is disposed",
			"Expected createBlob after dispose to reject synchronously",
		);
	});

	it("dispose() cascades to the wrapped inner IDocumentService", async () => {
		// FrozenDocumentService owns the inner service it wraps (created by the wrapping
		// factory, never exposed to callers). The IDocumentService.dispose contract says
		// dispose is called by the storage consumer when done with storage; for the wrapped
		// frozen variant, that means FrozenDocumentService.dispose must forward.
		let innerDisposeError: unknown = "not-called";
		const innerService = {
			resolvedUrl: fakeUrl,
			policies: {},
			connectToStorage: async () => {
				throw new Error("not used in this test");
			},
			connectToDeltaStorage: async () => {
				throw new Error("not used in this test");
			},
			connectToDeltaStream: async () => {
				throw new Error("not used in this test");
			},
			dispose: (error?: unknown) => {
				innerDisposeError = error ?? "no-error";
			},
			on: () => innerService,
			off: () => innerService,
			once: () => innerService,
		} as unknown as IDocumentService;

		const innerFactory: IDocumentServiceFactory = {
			createDocumentService: async () => innerService,
			createContainer: async () => {
				throw new Error("not used in this test");
			},
		};

		const factory = new FrozenDocumentServiceFactory(false, innerFactory);
		const service = await factory.createDocumentService(fakeUrl);

		const sentinelError = new Error("teardown reason");
		service.dispose(sentinelError);

		assert.strictEqual(
			innerDisposeError,
			sentinelError,
			"Expected FrozenDocumentService.dispose to forward the error to the wrapped inner service",
		);
	});
});

describe("FrozenDocumentStorageService readBlob (no inner factory)", () => {
	// Offline frozen loads pass `undefined` for the inner factory. The
	// previous handler threw a raw `Error("Operations are not supported…")`,
	// which bypassed the package's UsageError contract and did not name the
	// missing precondition (pending state produced by
	// `captureFullContainerState`, which inlines attachment blobs). Verify
	// both: the error type so callers can detect misuse uniformly, and the
	// message so the diagnostic points at the right API.
	it("rejects readBlob with a UsageError that names captureFullContainerState", async () => {
		const factory = new FrozenDocumentServiceFactory(true);
		const service = await factory.createDocumentService(fakeUrl);
		const storage = await service.connectToStorage();

		await assert.rejects(storage.readBlob("non-existent-id"), (error: Error) => {
			assert.strictEqual(
				error.constructor.name,
				"UsageError",
				"Expected a UsageError, not a generic Error — frozen storage misuse must surface uniformly",
			);
			assert.match(
				error.message,
				/captureFullContainerState/,
				"Expected the error message to name the missing precondition (captureFullContainerState inlines attachment blobs)",
			);
			return true;
		});
	});

	it("readBlob delegates to the inner storage when one is provided", async () => {
		// Inverse of the offline assertion: with an inner factory the
		// wrapped storage's readBlob must serve, not throw — that's the
		// normal online frozen-load path.
		const innerBytes = new Uint8Array([42]).buffer;
		const innerStorage = {
			readBlob: async () => innerBytes,
		} as unknown as IDocumentStorageService;
		const innerService = {
			resolvedUrl: fakeUrl,
			policies: {},
			connectToStorage: async () => innerStorage,
			connectToDeltaStorage: async () => {
				throw new Error("not used in this test");
			},
			connectToDeltaStream: async () => {
				throw new Error("not used in this test");
			},
			dispose: () => {},
			on: () => innerService,
			off: () => innerService,
			once: () => innerService,
		} as unknown as IDocumentService;
		const innerFactory: IDocumentServiceFactory = {
			createDocumentService: async () => innerService,
			createContainer: async () => {
				throw new Error("not used in this test");
			},
		};
		const factory = new FrozenDocumentServiceFactory(true, innerFactory);
		const service = await factory.createDocumentService(fakeUrl);
		const storage = await service.connectToStorage();

		const result = await storage.readBlob("any-id");
		assert.strictEqual(
			result,
			innerBytes,
			"Expected readBlob to delegate byte-identically to the inner storage",
		);
	});
});
