/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import { DataProcessingError } from "@fluidframework/telemetry-utils/internal";
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

describe("SharedObject ordinary dispatch", () => {
	it("does not install configuration for legacy subclasses during creation or load", async () => {
		for (const initialize of ["create", "load"] as const) {
			const runtime = new MockFluidDataStoreRuntime({ attachState: AttachState.Detached });
			const shared = new LegacySharedObject(runtime);
			const attributes = shared.attributes;
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
			assert(!("channelConfigurationProtocolVersion" in shared));
			assert.equal(shared.attributes, attributes);
			assert(!("configuration" in shared.attributes));
			runtime.dispose();
		}
	});

	for (const attachState of [AttachState.Detached, AttachState.Attached]) {
		it(`rejects the reserved configuration key on ordinary submissions (${attachState})`, async () => {
			const runtime = new MockFluidDataStoreRuntime({ attachState });
			const shared = new LegacySharedObject(runtime);
			const submitted: unknown[] = [];
			const delta = new MockDeltaConnection(
				(contents: unknown) => submitted.push(contents),
				() => {},
			);
			await shared.load({ deltaConnection: delta, objectStorage: new MockStorage() });
			assert.throws(
				() =>
					shared.submit({
						isChannelConfigurationOp: false,
						get payload(): never {
							return assert.fail("Reserved marker must be rejected before handle preparation");
						},
					}),
				DataProcessingError,
			);
			assert.equal(submitted.length, 0);
			runtime.dispose();
		});
	}

	it("rejects the reserved key before ordinary delivery or replay hooks", async () => {
		const runtime = new MockFluidDataStoreRuntime();
		const shared = new LegacySharedObject(runtime);
		const delta = new MockDeltaConnection(
			() => 0,
			() => {},
		);
		await shared.load({ deltaConnection: delta, objectStorage: new MockStorage() });
		const contents = {
			isChannelConfigurationOp: true,
			version: 1,
			expectedRevision: 0,
			values: {},
		};
		for (const invoke of [
			() => delta.processMessages(collection(contents, {})),
			() => delta.applyStashedOp(contents),
			() => delta.reSubmit(contents, {}, false),
			() => delta.rollback?.(contents, {}),
		]) {
			assert.throws(invoke, DataProcessingError);
		}
		assert.deepEqual(shared.calls, []);
		assert.deepEqual(shared.messages, []);
		runtime.dispose();
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
