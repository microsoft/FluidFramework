/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import type {
	IRuntimeMessageCollection,
	ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions/internal";
import { RemoteFluidObjectHandle } from "@fluidframework/runtime-utils/internal";
import { DataProcessingError } from "@fluidframework/telemetry-utils/internal";
import {
	MockDeltaConnection,
	MockFluidDataStoreRuntime,
	MockHandle,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { SharedObject } from "../sharedObject.js";
import {
	defaultSharedObjectProtocol,
	getSharedObjectProtocol,
	sharedObjectProtocols,
	type SharedObjectProtocol,
} from "../sharedObjectProtocol.js";
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

class LegacySharedObject extends SharedObject {
	public readonly calls: unknown[][] = [];
	public readonly messages: IRuntimeMessageCollection[] = [];

	public constructor(runtime: MockFluidDataStoreRuntime) {
		super("legacy", runtime, { type: "legacy", snapshotFormatVersion: "1" }, "legacy");
	}

	public submit(contents: unknown, metadata?: unknown): void {
		this.submitLocalMessage(contents, metadata);
	}

	protected summarizeCore(): ISummaryTreeWithStats {
		return createSingleBlobSummary("data", "{}");
	}

	protected async loadCore(): Promise<void> {}

	protected onDisconnect(): void {}

	protected processMessagesCore(messages: IRuntimeMessageCollection): void {
		this.calls.push(["process"]);
		this.messages.push(messages);
	}

	protected applyStashedOp(contents: unknown): void {
		this.calls.push(["stash", contents]);
	}

	protected override reSubmitCore(contents: unknown, metadata: unknown): void {
		this.calls.push(["resubmit", contents, metadata]);
	}

	protected override reSubmitSquashed(contents: unknown, metadata: unknown): void {
		this.calls.push(["squash", contents, metadata]);
	}

	protected override rollback(contents: unknown, metadata: unknown): void {
		this.calls.push(["rollback", contents, metadata]);
	}
}

describe("SharedObject protocol dispatch", () => {
	it("uses the default protocol for legacy subclasses during creation or load", async () => {
		for (const initialize of ["create", "load"] as const) {
			const runtime = new MockFluidDataStoreRuntime({ attachState: AttachState.Detached });
			const shared = new LegacySharedObject(runtime);
			assert.equal(sharedObjectProtocols.has(shared), false);
			if (initialize === "create") {
				shared.initializeLocal();
			} else {
				await shared.load({
					deltaConnection: new MockDeltaConnection(
						() => 0,
						() => {},
					),
					objectStorage: new MockStorage(),
				});
			}
			assert.equal(sharedObjectProtocols.has(shared), false);
			assert.equal(getSharedObjectProtocol(shared), defaultSharedObjectProtocol);
			runtime.dispose();
		}
	});

	it("shares the stateless default and resolves registered protocols", () => {
		const first = {};
		const second = {};
		assert.equal(getSharedObjectProtocol(first), defaultSharedObjectProtocol);
		assert.equal(getSharedObjectProtocol(second), defaultSharedObjectProtocol);
		const registered = {
			prepareLocalMessage: (content: unknown): { content: unknown } => ({ content }),
			submitLocalMessage: defaultSharedObjectProtocol.submitLocalMessage,
			submitWhileDetached: defaultSharedObjectProtocol.submitWhileDetached,
			processMessages: defaultSharedObjectProtocol.processMessages,
			applyStashedOp: defaultSharedObjectProtocol.applyStashedOp,
			reSubmit: defaultSharedObjectProtocol.reSubmit,
			rollback: defaultSharedObjectProtocol.rollback,
			close: defaultSharedObjectProtocol.close,
		};
		sharedObjectProtocols.set(first, registered);
		assert.equal(getSharedObjectProtocol(first), registered);
		assert.equal(getSharedObjectProtocol(second), defaultSharedObjectProtocol);
	});

	it("retains legacy DDS events and stash, resubmit, squash and rollback hooks", async () => {
		const runtime = new MockFluidDataStoreRuntime({ attachState: AttachState.Attached });
		const shared = new LegacySharedObject(runtime);
		const delta = new MockDeltaConnection(
			() => 0,
			() => {},
		);
		await shared.load({ deltaConnection: delta, objectStorage: new MockStorage() });
		const content = { kind: "ordinary", version: 1 };
		const metadata = { origin: "local" };
		shared.on("pre-op", () => shared.calls.push(["pre-op"]));
		shared.on("op", () => shared.calls.push(["op"]));
		const messages = collection(content, metadata);
		delta.processMessages(messages);
		assert.equal(shared.messages[0]?.envelope, messages.envelope);
		assert.equal(shared.messages[0]?.local, true);
		assert.equal(shared.messages[0]?.messagesContent[0]?.contents, content);
		assert.equal(shared.messages[0]?.messagesContent[0]?.localOpMetadata, metadata);
		delta.applyStashedOp(content);
		delta.reSubmit(content, metadata, false);
		delta.reSubmit(content, metadata, true);
		delta.rollback?.(content, metadata);
		assert.deepEqual(shared.calls, [
			["pre-op"],
			["process"],
			["op"],
			["stash", content],
			["resubmit", content, metadata],
			["squash", content, metadata],
			["rollback", content, metadata],
		]);
		for (const call of shared.calls.slice(3)) {
			assert.equal(call[1], content);
			if (call[0] !== "stash") {
				assert.equal(call[2], metadata);
			}
		}
		runtime.dispose();
	});

	it("keeps detached legacy edits as no-ops without replaying them on attachment", () => {
		const runtime = new MockFluidDataStoreRuntime({ attachState: AttachState.Detached });
		const shared = new LegacySharedObject(runtime);
		const submitted: unknown[][] = [];
		const delta = new MockDeltaConnection(
			(contents: unknown, metadata) => submitted.push([contents, metadata]),
			() => {},
		);
		shared.submit("before services");
		shared.connect({ deltaConnection: delta, objectStorage: new MockStorage() });
		shared.submit("detached");
		runtime.setAttachState(AttachState.Attaching);
		assert.equal(submitted.length, 0);
		shared.submit("attached");
		assert.deepEqual(submitted, [["attached", undefined]]);
		runtime.dispose();
	});

	it("continues submitting attached legacy edits while disconnected", async () => {
		const runtime = new MockFluidDataStoreRuntime({ attachState: AttachState.Attached });
		const shared = new LegacySharedObject(runtime);
		const submitted: unknown[][] = [];
		const delta = new MockDeltaConnection(
			(contents: unknown, metadata) => submitted.push([contents, metadata]),
			() => {},
		);
		await shared.load({ deltaConnection: delta, objectStorage: new MockStorage() });
		delta.setConnectionState(false);
		const content = { offline: true };
		const localMetadata = { pending: true };
		shared.submit(content, localMetadata);
		assert.deepEqual(submitted, [[content, localMetadata]]);
		assert.equal(submitted[0]?.[1], localMetadata);
		runtime.dispose();
	});

	it("delegates operations before handle decoding and DDS hooks and closes after recording the error", () => {
		const runtime = new MockFluidDataStoreRuntime({ attachState: AttachState.Detached });
		const shared = new LegacySharedObject(runtime);
		const content = { kind: "ordinary" };
		const metadata = { origin: "local" };
		const prepared = new MockHandle("prepared");
		const serialized = { type: "__fluid_handle__", url: prepared.absolutePath };
		const submitted: unknown[][] = [];
		const delta = new MockDeltaConnection(
			(contents: unknown, localMetadata) => submitted.push([contents, localMetadata]),
			() => {},
		);
		const protocol: SharedObjectProtocol = {
			prepareLocalMessage: (contents): MockHandle<string> => {
				assert.equal(contents, content);
				shared.calls.push(["prepare"]);
				return prepared;
			},
			submitWhileDetached: (contents, localMetadata): void => {
				assert.equal(contents, prepared);
				assert.equal(localMetadata, metadata);
				shared.calls.push(["protocol-detached"]);
			},
			submitLocalMessage: (contents, submit): void => {
				assert.equal(contents, prepared);
				assert.equal(submitted.length, 0);
				shared.calls.push(["protocol-submit"]);
				submit();
				assert.deepEqual(submitted, [[serialized, metadata]]);
			},
			processMessages: (messagesCollection, deliver): void => {
				assert.equal(messagesCollection.messagesContent[0]?.contents, serialized);
				shared.calls.push(["protocol-process"]);
				deliver(messagesCollection);
			},
			applyStashedOp: (contents, apply): void => {
				assert.equal(contents, serialized);
				shared.calls.push(["protocol-stash"]);
				apply(contents);
			},
			reSubmit: (contents, localMetadata, reSubmit): void => {
				assert.equal(contents, serialized);
				assert.equal(localMetadata, metadata);
				shared.calls.push(["protocol-resubmit"]);
				reSubmit(contents, localMetadata);
			},
			rollback: (contents, localMetadata, rollback): void => {
				assert.equal(contents, serialized);
				assert.equal(localMetadata, metadata);
				shared.calls.push(["protocol-rollback"]);
				rollback(contents, localMetadata);
			},
			close: (error): void => {
				assert(error instanceof DataProcessingError);
				shared.calls.push(["protocol-close", error]);
				assert.throws(
					() => shared.submit(content),
					(thrown: unknown) => thrown === error,
				);
			},
		};
		sharedObjectProtocols.set(shared, protocol);
		shared.initializeLocal();
		shared.submit(content, metadata);
		assert.deepEqual(submitted, []);
		shared.connect({ deltaConnection: delta, objectStorage: new MockStorage() });
		runtime.setAttachState(AttachState.Attaching);
		shared.submit(content, metadata);
		shared.on("pre-op", () => shared.calls.push(["pre-op"]));
		shared.on("op", () => shared.calls.push(["op"]));
		const messages = collection(serialized, metadata);
		delta.processMessages(messages);
		const decoded = shared.messages[0]?.messagesContent[0]?.contents;
		assert(decoded instanceof RemoteFluidObjectHandle);
		assert.equal(decoded.absolutePath, prepared.absolutePath);
		delta.applyStashedOp(serialized);
		const stashed = shared.calls.at(-1)?.[1];
		assert(stashed instanceof RemoteFluidObjectHandle);
		assert.equal(stashed.absolutePath, prepared.absolutePath);
		delta.reSubmit(serialized, metadata, false);
		assert.deepEqual(shared.calls.at(-1), ["resubmit", serialized, metadata]);
		delta.reSubmit(serialized, metadata, true);
		assert.deepEqual(shared.calls.at(-1), ["squash", serialized, metadata]);
		delta.rollback?.(serialized, metadata);
		assert.deepEqual(shared.calls.at(-1), ["rollback", serialized, metadata]);
		assert.deepEqual(
			shared.calls.map(([name]) => name),
			[
				"prepare",
				"protocol-detached",
				"prepare",
				"protocol-submit",
				"protocol-process",
				"pre-op",
				"process",
				"op",
				"protocol-stash",
				"stash",
				"protocol-resubmit",
				"resubmit",
				"protocol-resubmit",
				"squash",
				"protocol-rollback",
				"rollback",
			],
		);

		shared.on("op", () => {
			throw new Error("Listener failure");
		});
		assert.throws(() => delta.processMessages(messages), DataProcessingError);
		const closeError = shared.calls.at(-1)?.[1];
		assert(closeError instanceof DataProcessingError);
		assert.throws(
			() => delta.processMessages(messages),
			(error: unknown) => error === closeError,
		);
		runtime.dispose();
		assert.equal(shared.calls.filter(([name]) => name === "protocol-close").length, 1);
	});
});
