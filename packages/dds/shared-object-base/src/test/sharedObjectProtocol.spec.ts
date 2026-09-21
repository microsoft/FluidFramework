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
import {
	MockDeltaConnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { SharedObject } from "../sharedObject.js";
import {
	defaultSharedObjectProtocol,
	getSharedObjectProtocol,
	sharedObjectProtocols,
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
	it("shares the stateless default and resolves registered protocols", () => {
		const first = {};
		const second = {};
		assert.equal(getSharedObjectProtocol(first), defaultSharedObjectProtocol);
		assert.equal(getSharedObjectProtocol(second), defaultSharedObjectProtocol);
		const registered = {
			prepareLocalMessage: (content: unknown) => ({ content }),
			submitWhileDetached: defaultSharedObjectProtocol.submitWhileDetached,
			flushPendingSubmissions: defaultSharedObjectProtocol.flushPendingSubmissions,
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

	it("forwards default payloads, metadata and collections without changing identity", () => {
		const protocol = getSharedObjectProtocol({});
		const content = { kind: "configuration", version: 1 };
		const metadata = {};
		const messages = collection(content, metadata);
		const calls: string[] = [];
		assert.equal(protocol.prepareLocalMessage(content), content);
		protocol.processMessages(messages, (delivered) => {
			calls.push("process");
			assert.equal(delivered, messages);
			assert.equal(delivered.messagesContent, messages.messagesContent);
		});
		protocol.applyStashedOp(content, (delivered) => {
			calls.push("stash");
			assert.equal(delivered, content);
		});
		protocol.reSubmit(content, metadata, (delivered, localMetadata) => {
			calls.push("resubmit");
			assert.equal(delivered, content);
			assert.equal(localMetadata, metadata);
		});
		protocol.rollback(content, metadata, (delivered, localMetadata) => {
			calls.push("rollback");
			assert.equal(delivered, content);
			assert.equal(localMetadata, metadata);
		});
		assert.deepEqual(calls, ["process", "stash", "resubmit", "rollback"]);
	});

	it("does not retain detached submissions or lifecycle state in the default protocol", () => {
		const protocol = getSharedObjectProtocol({});
		const content = {};
		protocol.submitWhileDetached(content, {});
		protocol.flushPendingSubmissions();
		protocol.close(new Error("unrelated instance failure"));
		const other = getSharedObjectProtocol({});
		assert.equal(other.prepareLocalMessage(content), content);
		other.processMessages(collection(content, undefined), (messages) => {
			assert.equal(messages.messagesContent.length, 1);
			assert.equal(messages.messagesContent[0]?.contents, content);
		});
	});

	it("propagates callback errors unchanged from the default protocol", () => {
		const protocol = getSharedObjectProtocol({});
		const error = new Error("DDS hook failed");
		const fail = (): never => {
			throw error;
		};
		for (const invoke of [
			() => protocol.processMessages(collection({}, {}), fail),
			() => protocol.applyStashedOp({}, fail),
			() => protocol.reSubmit({}, {}, fail),
			() => protocol.rollback({}, {}, fail),
		]) {
			assert.throws(invoke, (thrown: unknown) => thrown === error);
		}
	});

	it("retains legacy DDS events and stash, resubmit, squash and rollback hooks", async () => {
		const runtime = new MockFluidDataStoreRuntime({ attachState: AttachState.Attached });
		const shared = new LegacySharedObject(runtime);
		const delta = new MockDeltaConnection(
			() => 0,
			() => {},
		);
		await shared.load({ deltaConnection: delta, objectStorage: new MockStorage() });
		const content = { kind: "configuration", version: 1 };
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

	for (const attachState of [AttachState.Attaching, AttachState.Attached]) {
		it(`still fails a legacy bound submission without services (${attachState})`, () => {
			const runtime = new MockFluidDataStoreRuntime({ attachState });
			const shared = new LegacySharedObject(runtime);
			shared.bindToContext();
			assert.equal(shared.isAttached(), true);
			assert.throws(() => shared.submit("missing services"), TypeError);
			runtime.dispose();
		});
	}

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
});
