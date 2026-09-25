/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IBatchMessage } from "@fluidframework/container-definitions/internal";
import { ContainerMessageType } from "@fluidframework/container-runtime/internal";
import {
	MessageType,
	type ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";

import {
	createSeedBaselineDescriptor,
	SeedBaselineMismatchError,
	SeedBaselineProtocol,
	seedBaselineMetadataKey,
} from "../seedBaselineFingerprint.js";

/** Retained named application content with stable storage IDs for descriptor tests. */
const seed = {
	manifestId: "manifest",
	partBlobIds: { first: "first", second: "second" },
	manifest: "{}",
	parts: [
		{ name: "first", payload: "<p>one</p>" },
		{ name: "second", payload: "<p>two</p>" },
	],
};
/** Fixed construction proof independent of any live runtime or transport session. */
const descriptor = createSeedBaselineDescriptor(seed, 0, "profile/1", "a".repeat(64));

function packet(metadata?: Record<string, unknown>): ISequencedDocumentMessage {
	return {
		type: MessageType.Operation,
		clientId: "writer",
		clientSequenceNumber: 1,
		sequenceNumber: 1,
		referenceSequenceNumber: 0,
		minimumSequenceNumber: 0,
		timestamp: 0,
		contents: {},
		metadata,
	};
}

describe("Seed baseline fingerprint: packet contract", () => {
	it("binds source identity independently from the materializer's result and profile", () => {
		const other = createSeedBaselineDescriptor(seed, 0, "profile/2", "b".repeat(64));
		assert.equal(descriptor.seedId, other.seedId);
		assert.notEqual(
			descriptor.seedId,
			createSeedBaselineDescriptor(seed, 1, "profile/1", "a".repeat(64)).seedId,
		);
		assert.throws(
			() => new SeedBaselineProtocol(descriptor).validateProof(other),
			SeedBaselineMismatchError,
		);
	});

	it("binds the named blob mapping but not its enumeration order", () => {
		const reordered = {
			...seed,
			parts: [...seed.parts].reverse(),
			partBlobIds: { second: "second", first: "first" },
		};
		assert.equal(
			createSeedBaselineDescriptor(reordered, 0, "profile/1", "a".repeat(64)).seedId,
			descriptor.seedId,
		);
		const swapped = { ...seed, partBlobIds: { first: "second", second: "first" } };
		assert.notEqual(
			createSeedBaselineDescriptor(swapped, 0, "profile/1", "a".repeat(64)).seedId,
			descriptor.seedId,
		);
		const renamed = {
			...seed,
			parts: [{ name: "renamed", payload: seed.parts[0].payload }, seed.parts[1]],
			partBlobIds: { renamed: "first", second: "second" },
		};
		assert.notEqual(
			createSeedBaselineDescriptor(renamed, 0, "profile/1", "a".repeat(64)).seedId,
			descriptor.seedId,
		);
	});

	it("stamps every packet without overwriting native metadata, contents, or reference numbers", () => {
		const protocol = new SeedBaselineProtocol(descriptor);
		const messages: IBatchMessage[] = [
			{
				contents: "first",
				metadata: { batch: true, batchId: "id" },
				referenceSequenceNumber: 7,
			},
			{
				contents: "last",
				metadata: { batch: false },
				compression: "lz4",
				referenceSequenceNumber: 7,
			},
		];
		const before = structuredClone(messages);
		for (let attempt = 0; attempt < 3; attempt++) {
			const stamped = protocol.stampBatch(messages);
			for (const [index, message] of stamped.entries()) {
				protocol.validateMessage(packet(message.metadata));
				assert.deepEqual(message, {
					...before[index],
					metadata: { ...before[index].metadata, [seedBaselineMetadataKey]: descriptor },
				});
			}
		}
		assert.deepEqual(messages, before);
	});

	it("rejects missing proof on later packets instead of trusting a cached first-operation handshake", () => {
		const protocol = new SeedBaselineProtocol(descriptor);
		protocol.validateMessage(packet(protocol.stampMetadata(undefined)));
		assert.throws(() => protocol.validateMessage(packet()), SeedBaselineMismatchError);
	});

	for (const type of [MessageType.NoOp, MessageType.ClientJoin, MessageType.SummaryAck]) {
		it(`does not require a runtime fingerprint on ${type} control messages`, () => {
			new SeedBaselineProtocol(descriptor).validateMessage({ ...packet(), type });
		});
	}

	for (const type of [...Object.values(ContainerMessageType), "future-native-envelope"]) {
		it(`requires proof on unpacked ${type} envelopes instead of treating them as control traffic`, () => {
			const protocol = new SeedBaselineProtocol(descriptor);
			assert.throws(
				() => protocol.validateMessage({ ...packet(), type }),
				SeedBaselineMismatchError,
			);
			protocol.validateMessage({ ...packet(protocol.stampMetadata(undefined)), type });
		});
	}

	for (const field of ["seedId", "profileVersion", "hashVersion", "baselineHash"] as const) {
		it(`retains expected and received ${field} evidence on disagreement`, () => {
			const received = {
				...descriptor,
				[field]: field === "profileVersion" ? "other/1" : "b".repeat(64),
			};
			assert.throws(
				() =>
					new SeedBaselineProtocol(descriptor).validateMessage(
						packet({
							[seedBaselineMetadataKey]: received,
						}),
					),
				(error: unknown) => {
					assert(error instanceof SeedBaselineMismatchError);
					assert.deepEqual(error.expected, descriptor);
					assert.deepEqual(error.received, received);
					assert.equal(error.packet?.sequenceNumber, 1);
					return true;
				},
			);
		});
	}

	it("rejects conflicting outbound metadata instead of silently overwriting an existing proof", () => {
		assert.throws(
			() =>
				new SeedBaselineProtocol(descriptor).stampMetadata({
					[seedBaselineMetadataKey]: { ...descriptor, baselineHash: "b".repeat(64) },
				}),
			SeedBaselineMismatchError,
		);
	});
});
