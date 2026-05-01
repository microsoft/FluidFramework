/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IDocumentMessage, INack } from "@fluidframework/driver-definitions/internal";

import { FrozenDeltaStream } from "../frozenServices.js";

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
			const stream = new FrozenDeltaStream({ readOnly: false });
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
			const stream = new FrozenDeltaStream({ readOnly: false });
			let eventCount = 0;
			stream.on("nack", () => eventCount++);

			stream.submitSignal({ type: "test", content: {} });

			assert.strictEqual(eventCount, 0, "Expected submitSignal to be a silent no-op");
		});
	});

	describe("constructor guards", () => {
		it("rejects storageOnlyReason on the writable variant", () => {
			assert.throws(
				() => new FrozenDeltaStream({ readOnly: false, storageOnlyReason: "nope" }),
				/storageOnlyReason is only meaningful for the read-only frozen delta stream variant/,
			);
		});

		it("rejects readonlyConnectionReason on the writable variant", () => {
			assert.throws(
				() =>
					new FrozenDeltaStream({
						readOnly: false,
						readonlyConnectionReason: { text: "nope" },
					}),
				/readonlyConnectionReason is only meaningful for the read-only frozen delta stream variant/,
			);
		});

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
