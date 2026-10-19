/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import type { IChannelServices } from "@fluidframework/datastore-definitions/internal";
import {
	MessageType,
	type ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import type {
	IRuntimeMessageCollection,
	ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions/internal";
import { isFluidHandle, isSerializedHandle } from "@fluidframework/runtime-utils/internal";
import {
	MockDeltaConnection,
	MockFluidDataStoreRuntime,
	MockHandle,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { SharedObject } from "../sharedObject.js";
import { createSingleBlobSummary } from "../utils.js";

function collection(contents: unknown, metadata: unknown): IRuntimeMessageCollection {
	return {
		envelope: {
			clientId: "client",
			sequenceNumber: 10,
			referenceSequenceNumber: 0,
			minimumSequenceNumber: 0,
			timestamp: 0,
			type: MessageType.Operation,
		},
		local: true,
		messagesContent: [{ contents, localOpMetadata: metadata, clientSequenceNumber: 1 }],
	};
}

class MockSharedObject extends SharedObject {
	public readonly calls: unknown[][] = [];
	public readonly messages: IRuntimeMessageCollection[] = [];
	public readonly connectionStates: boolean[] = [];

	public constructor(runtime: MockFluidDataStoreRuntime) {
		super("mock", runtime, { type: "mock", snapshotFormatVersion: "1" }, "mock");
	}

	public submit(contents: unknown, metadata?: unknown): void {
		this.submitLocalMessage(contents, metadata);
	}

	protected summarizeCore(): ISummaryTreeWithStats {
		return createSingleBlobSummary("data", "{}");
	}

	protected async loadCore(): Promise<void> {}

	protected override onConnect(): void {
		this.connectionStates.push(true);
	}

	protected onDisconnect(): void {
		this.connectionStates.push(false);
	}

	protected processMessagesCore(messages: IRuntimeMessageCollection): void {
		this.calls.push(["process"]);
		this.messages.push(messages);
	}

	protected applyStashedOp(contents: unknown): void {
		this.calls.push(["stash", contents]);
	}

	protected override reSubmitCore(contents: unknown, metadata: unknown): void {
		this.calls.push(["reSubmit", contents, metadata]);
		super.reSubmitCore(contents, metadata);
	}

	protected override reSubmitSquashed(contents: unknown, metadata: unknown): void {
		this.calls.push(["squash", contents, metadata]);
		super.reSubmitSquashed(contents, metadata);
	}

	protected override rollback(contents: unknown, metadata: unknown): void {
		this.calls.push(["rollback", contents, metadata]);
	}
}

describe("SharedObject ordinary dispatch", () => {
	const runtimes: MockFluidDataStoreRuntime[] = [];

	function createFixture(attachState: AttachState): {
		runtime: MockFluidDataStoreRuntime;
		sharedObject: MockSharedObject;
		delta: MockDeltaConnection;
		services: IChannelServices;
		submitted: [unknown, unknown][];
	} {
		const runtime = new MockFluidDataStoreRuntime({ attachState });
		runtimes.push(runtime);
		const sharedObject = new MockSharedObject(runtime);
		const submitted: [unknown, unknown][] = [];
		const delta = new MockDeltaConnection(
			(contents: unknown, metadata) => submitted.push([contents, metadata]),
			() => {},
		);
		return {
			runtime,
			sharedObject,
			delta,
			services: { deltaConnection: delta, objectStorage: new MockStorage() },
			submitted,
		};
	}

	afterEach(() => {
		for (const runtime of runtimes) {
			runtime.dispose();
		}
		runtimes.length = 0;
	});

	for (const initialize of ["create", "load"] as const) {
		it(`retains ordinary payloads, events and replay hooks after ${initialize}`, async () => {
			const { sharedObject, delta, services, submitted } = createFixture(AttachState.Attached);
			if (initialize === "create") {
				sharedObject.initializeLocal();
				sharedObject.connect(services);
			} else {
				await sharedObject.load(services);
			}
			const content = {
				kind: "configuration",
				isChannelConfigurationOp: true,
				version: 1,
				expectedRevision: 0,
				values: {},
			};
			const metadata = { origin: "local" };
			sharedObject.on("pre-op", () => sharedObject.calls.push(["pre-op"]));
			sharedObject.on("op", () => sharedObject.calls.push(["op"]));
			sharedObject.submit(content, metadata);
			const messages = collection(content, metadata);
			delta.processMessages(messages);
			assert.equal(sharedObject.messages[0]?.envelope, messages.envelope);
			assert.equal(sharedObject.messages[0]?.local, true);
			assert.deepEqual(sharedObject.messages[0]?.messagesContent, messages.messagesContent);
			assert.equal(sharedObject.messages[0]?.messagesContent[0]?.contents, content);
			assert.equal(sharedObject.messages[0]?.messagesContent[0]?.localOpMetadata, metadata);
			assert.equal(delta.applyStashedOp(content), undefined);
			delta.reSubmit(content, metadata, false);
			delta.reSubmit(content, metadata, true);
			delta.rollback?.(content, metadata);
			assert.deepEqual(sharedObject.calls, [
				["pre-op"],
				["process"],
				["op"],
				["stash", content],
				["reSubmit", content, metadata],
				["squash", content, metadata],
				["reSubmit", content, metadata],
				["rollback", content, metadata],
			]);
			assert.equal(submitted.length, 3);
			for (const [contents, localMetadata] of submitted) {
				assert.equal(contents, content);
				assert.equal(localMetadata, metadata);
			}
		});
	}

	it("decodes Fluid handles before batch events, processing and stashed-op replay", async () => {
		const { sharedObject, delta, services } = createFixture(AttachState.Attached);
		await sharedObject.load(services);
		const encodedHandle = { type: "__fluid_handle__", url: "/referenced" };
		const metadata = { origin: "local" };
		const firstMessage = collection(encodedHandle, metadata);
		const messages: IRuntimeMessageCollection = {
			...firstMessage,
			messagesContent: [
				...firstMessage.messagesContent,
				{
					contents: "second",
					localOpMetadata: undefined,
					clientSequenceNumber: 2,
				},
			],
		};
		const events: ISequencedDocumentMessage[] = [];
		sharedObject.on("pre-op", (message, local) => {
			assert.equal(local, true);
			events.push(message);
			sharedObject.calls.push(["pre-op", message.clientSequenceNumber]);
		});
		sharedObject.on("op", (message) => {
			events.push(message);
			sharedObject.calls.push(["op", message.clientSequenceNumber]);
		});
		delta.processMessages(messages);
		const decoded = sharedObject.messages[0]?.messagesContent[0]?.contents;
		assert(isFluidHandle(decoded));
		assert.equal(sharedObject.messages[0]?.messagesContent[0]?.localOpMetadata, metadata);
		assert.equal(events[0]?.contents, decoded);
		assert.equal(events[2]?.contents, decoded);
		assert.deepEqual(sharedObject.calls, [
			["pre-op", 1],
			["pre-op", 2],
			["process"],
			["op", 1],
			["op", 2],
		]);
		delta.applyStashedOp(encodedHandle);
		assert(isFluidHandle(sharedObject.calls.at(-1)?.[1]));
		assert.equal(messages.messagesContent[0]?.contents, encodedHandle);
	});

	for (const onlyBind of [false, true]) {
		it(`binds Fluid handles before transmission and reSubmit (onlyBind: ${onlyBind})`, async () => {
			const { runtime, sharedObject, delta, services, submitted } = createFixture(
				AttachState.Attached,
			);
			Object.assign(runtime, { submitMessagesWithoutEncodingHandles: onlyBind });
			await sharedObject.load(services);
			sharedObject.handle.attachGraph();
			const handle = new MockHandle("referenced");
			const metadata = {};
			const observed: unknown[] = [];
			services.deltaConnection = new MockDeltaConnection(
				(contents: unknown) => {
					assert.equal(handle.isAttached, true);
					observed.push(contents);
					return observed.length;
				},
				() => {},
			);
			sharedObject.submit(handle, metadata);
			delta.reSubmit(handle, metadata, false);
			delta.reSubmit(handle, metadata, true);
			assert.equal(submitted.length, 0);
			assert.equal(observed.length, 3);
			for (const contents of observed) {
				if (onlyBind) {
					assert.equal(contents, handle);
				} else {
					assert(isSerializedHandle(contents));
					assert.equal(contents.url, handle.absolutePath);
				}
			}
		});

		it(`does not prepare or submit messages while detached (onlyBind: ${onlyBind})`, () => {
			const { runtime, sharedObject, services, submitted } = createFixture(
				AttachState.Detached,
			);
			Object.assign(runtime, { submitMessagesWithoutEncodingHandles: onlyBind });
			const content = {
				get payload(): never {
					return assert.fail("Detached submissions must not prepare messages");
				},
			};
			sharedObject.submit(content);
			sharedObject.connect(services);
			sharedObject.submit(content);
			runtime.setAttachState(AttachState.Attaching);
			assert.equal(submitted.length, 0);
		});

		it(`does not submit a message when preparation throws (onlyBind: ${onlyBind})`, async () => {
			const { runtime, sharedObject, services, submitted } = createFixture(
				AttachState.Attached,
			);
			Object.assign(runtime, { submitMessagesWithoutEncodingHandles: onlyBind });
			await sharedObject.load(services);
			const error = new Error("Message preparation failed");
			const content = {
				get payload(): never {
					throw error;
				},
			};
			assert.throws(
				() => sharedObject.submit(content),
				(caught: unknown) => caught === error,
			);
			assert.equal(submitted.length, 0);
			sharedObject.submit("attached");
			assert.deepEqual(submitted, [["attached", undefined]]);
		});
	}

	it("selects the delta connection after message preparation", async () => {
		const { sharedObject, services, submitted } = createFixture(AttachState.Attached);
		await sharedObject.load(services);
		const replacementSubmissions: unknown[] = [];
		const replacement = new MockDeltaConnection(
			(contents: unknown) => replacementSubmissions.push(contents),
			() => {},
		);
		const content = {
			get payload(): string {
				services.deltaConnection = replacement;
				return "prepared";
			},
		};
		sharedObject.submit(content);
		assert.equal(submitted.length, 0);
		assert.equal(replacementSubmissions[0], content);
	});

	it("continues submitting edits while attached and disconnected", async () => {
		const { sharedObject, delta, services, submitted } = createFixture(AttachState.Attached);
		await sharedObject.load(services);
		delta.setConnectionState(false);
		assert.equal(sharedObject.connected, false);
		assert.deepEqual(sharedObject.connectionStates, [true, false]);
		const content = { offline: true };
		const metadata = { pending: true };
		sharedObject.submit(content, metadata);
		assert.deepEqual(submitted, [[content, metadata]]);
		assert.equal(submitted[0]?.[1], metadata);
		delta.setConnectionState(true);
		assert.equal(sharedObject.connected, true);
		assert.deepEqual(sharedObject.connectionStates, [true, false, true]);
	});

	it("retains the first close error before subsequent preparation or processing", async () => {
		const { sharedObject, delta, services, submitted } = createFixture(AttachState.Attached);
		await sharedObject.load(services);
		let listenerError = new Error("First listener error");
		sharedObject.on("pre-op", () => {
			throw listenerError;
		});
		let closeError: unknown;
		assert.throws(
			() => delta.processMessages(collection("first", undefined)),
			(error: unknown) => {
				closeError = error;
				return true;
			},
		);
		listenerError = new Error("Second listener error");
		assert.throws(() => sharedObject.emit("pre-op"));
		const content = {
			get payload(): never {
				return assert.fail("Closed objects must not prepare messages");
			},
		};
		assert.throws(
			() => sharedObject.submit(content),
			(error: unknown) => error === closeError,
		);
		assert.throws(
			() => delta.processMessages(collection(content, undefined)),
			(error: unknown) => error === closeError,
		);
		assert.deepEqual(sharedObject.calls, []);
		assert.deepEqual(submitted, []);
	});
});
