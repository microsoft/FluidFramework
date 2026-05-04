/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	IClient,
	IDocumentMessage,
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
