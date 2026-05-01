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

import { FrozenDeltaStream, FrozenDocumentServiceFactory } from "../frozenServices.js";

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

const fakeWriteClient = (): IClient => ({
	mode: "write",
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

describe("FrozenDocumentService.connectToDeltaStream upgrade-hang lifecycle", () => {
	// Defense-in-depth coverage: the sendMessages short-circuit means this hang path is
	// unreachable in normal flow, but the rejecter logic on dispose() must still work for
	// invariant breaks (e.g. nack-driven reconnectOnError("write") if FrozenDeltaStream.submit
	// were ever called directly). Drives connectToDeltaStream({mode: "write"}) directly to
	// exercise the rejecter — restores the coverage that the integration "dispose() while
	// upgrade is hung" test once provided before the sendMessages short-circuit closed off
	// the runtime-driven path.

	it("rejects the hung upgrade-connect when service.dispose() is called", async () => {
		const factory = new FrozenDocumentServiceFactory(false);
		const service = await factory.createDocumentService(fakeUrl);

		// Initial connect — flips handedOutInitialConnection so the next call lands on the
		// upgrade-hang branch.
		const initial = await service.connectToDeltaStream(fakeReadClient());
		assert(initial instanceof FrozenDeltaStream);

		// Subsequent write-mode connect — must hang until dispose.
		const hangPromise = service.connectToDeltaStream(fakeWriteClient());
		let rejection: Error | undefined;
		hangPromise.catch((e: Error) => {
			rejection = e;
		});

		// Yield microtasks; the hang must not settle of its own accord. Capture into a
		// separate const so the strictEqual narrowing doesn't propagate to the
		// post-dispose check (which would narrow rejection to never).
		for (let i = 0; i < 10; i++) {
			// eslint-disable-next-line no-await-in-loop
			await Promise.resolve();
		}
		const beforeDispose: Error | undefined = rejection;
		assert.strictEqual(
			beforeDispose,
			undefined,
			"Expected upgrade-connect promise to remain pending before dispose()",
		);

		service.dispose();

		// Allow the rejection to propagate.
		for (let i = 0; i < 10; i++) {
			// eslint-disable-next-line no-await-in-loop
			await Promise.resolve();
		}
		assert(
			rejection !== undefined,
			"Expected upgrade-connect promise to reject after dispose()",
		);
		assert.match(rejection.message, /FrozenDocumentService disposed/);
	});

	it("rejects synchronously when called after service.dispose()", async () => {
		const factory = new FrozenDocumentServiceFactory(false);
		const service = await factory.createDocumentService(fakeUrl);

		// Flip handedOutInitialConnection.
		await service.connectToDeltaStream(fakeReadClient());
		service.dispose();

		await assert.rejects(
			service.connectToDeltaStream(fakeWriteClient()),
			/FrozenDocumentService disposed/,
			"Expected post-dispose write-mode connect to reject without registering a rejecter",
		);
	});

	it("drains multiple pending rejecters on a single dispose() call", async () => {
		const factory = new FrozenDocumentServiceFactory(false);
		const service = await factory.createDocumentService(fakeUrl);

		await service.connectToDeltaStream(fakeReadClient());

		const rejections: unknown[] = [];
		const captureRejection = (e: unknown): void => {
			rejections.push(e);
		};

		// Three independent hangs accumulate independent rejecters.
		service.connectToDeltaStream(fakeWriteClient()).catch(captureRejection);
		service.connectToDeltaStream(fakeWriteClient()).catch(captureRejection);
		service.connectToDeltaStream(fakeWriteClient()).catch(captureRejection);

		for (let i = 0; i < 10; i++) {
			// eslint-disable-next-line no-await-in-loop
			await Promise.resolve();
		}
		assert.strictEqual(rejections.length, 0);

		service.dispose();

		for (let i = 0; i < 10; i++) {
			// eslint-disable-next-line no-await-in-loop
			await Promise.resolve();
		}
		assert.strictEqual(
			rejections.length,
			3,
			"Expected dispose() to drain every pending rejecter",
		);
	});
});
