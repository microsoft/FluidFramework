/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import { encodeHandleForSerialization } from "@fluidframework/runtime-utils/internal";
import { MockHandle } from "@fluidframework/test-runtime-utils/internal";

import {
	ContainerMessageType,
	type LocalContainerRuntimeMessage,
} from "../../messageTypes.js";
import {
	ensureContentsDeserialized,
	serializeOp,
	tryGetDeserializedRuntimeOpCopy,
} from "../../opLifecycle/index.js";

describe("opSerialization", () => {
	describe("ensureContentsDeserialized", () => {
		it("should deserialize string contents into an object", () => {
			const message: Partial<ISequencedDocumentMessage> = {
				contents: '{"key":"value"}',
			};

			ensureContentsDeserialized(message as ISequencedDocumentMessage);

			assert.deepStrictEqual(message.contents, { key: "value" });
		});

		it("should not modify or replace contents if they are already deserialized", () => {
			const contents = { key: "value" };
			const message: Partial<ISequencedDocumentMessage> = {
				contents,
			};

			ensureContentsDeserialized(message as ISequencedDocumentMessage);

			assert.equal(message.contents, contents);
		});

		it("should not modify contents if they are an empty string", () => {
			const message: Partial<ISequencedDocumentMessage> = {
				contents: "",
			};

			ensureContentsDeserialized(message as ISequencedDocumentMessage);

			assert.strictEqual(message.contents, "");
		});
	});

	describe("serializeOp", () => {
		it("should serialize an op with no handles just like JSON.stringify", () => {
			const op: LocalContainerRuntimeMessage = {
				type: ContainerMessageType.Alias,
				contents: { internalId: "123", alias: "testAlias" },
			};

			const serialized = serializeOp(op);

			assert.strictEqual(serialized.content, JSON.stringify(op));
		});

		it("should replace Fluid handles with their encoded form", () => {
			const mockHandle = new MockHandle({});
			Object.assign(mockHandle, { foo: "should not be serialized" });

			const op: LocalContainerRuntimeMessage = {
				type: ContainerMessageType.FluidDataStoreOp,
				contents: {
					address: "123",
					contents: { type: "op", content: { address: "test", contents: mockHandle } },
				},
			};

			const serialized = serializeOp(op);

			assert(
				!serialized.content.includes("foo"),
				"Serialized op should not include the handle's properties besides the path",
			);
			assert(
				serialized.content.includes("__fluid_handle__") &&
					serialized.content.includes(mockHandle.absolutePath),
				"Serialized op should include the handle's path and encoded form",
			);
		});

		it("should encode an object with already-encoded handles equivalently to JSON.stringify", () => {
			const op: LocalContainerRuntimeMessage = {
				type: ContainerMessageType.FluidDataStoreOp,
				contents: {
					address: "123",
					contents: {
						type: "op",
						content: {
							address: "test",
							contents: encodeHandleForSerialization(new MockHandle({})),
						},
					},
				},
			};

			const serializedWithFunction = serializeOp(op);
			const serializedWithJSONStringify = JSON.stringify(op);

			assert.strictEqual(serializedWithFunction.content, serializedWithJSONStringify);
		});
	});

	describe("tryGetDeserializedRuntimeOpCopy", () => {
		it("returns a copy with deserialized contents for a runtime op, leaving the source unchanged", () => {
			const op: Partial<ISequencedDocumentMessage> = {
				type: MessageType.Operation,
				clientId: "client-1",
				contents: '{"key":"value"}',
			};

			const copy = tryGetDeserializedRuntimeOpCopy(op as ISequencedDocumentMessage);

			assert.notStrictEqual(copy, undefined);
			assert.notStrictEqual(copy, op, "must be a copy, not the source op");
			assert.deepStrictEqual(copy?.contents, { key: "value" });
			assert.strictEqual(op.contents, '{"key":"value"}', "source op must not be mutated");
		});

		it("returns undefined for a non-runtime op and does not deserialize its (non-JSON) contents", () => {
			// A system/server op may carry a non-JSON string payload; deserializing it would JSON.parse-throw.
			const op: Partial<ISequencedDocumentMessage> = {
				type: MessageType.ClientJoin,
				clientId: "client-1",
				contents: "not json {{{",
			};

			assert.strictEqual(
				tryGetDeserializedRuntimeOpCopy(op as ISequencedDocumentMessage),
				undefined,
			);
			assert.strictEqual(op.contents, "not json {{{", "non-runtime op must be left untouched");
		});

		it("returns undefined for a runtime op without a client id", () => {
			const op: Partial<ISequencedDocumentMessage> = {
				type: MessageType.Operation,
				// eslint-disable-next-line unicorn/no-null -- mirrors ISequencedDocumentMessage.clientId (string | null) for server-generated ops
				clientId: null,
				contents: '{"key":"value"}',
			};

			assert.strictEqual(
				tryGetDeserializedRuntimeOpCopy(op as ISequencedDocumentMessage),
				undefined,
			);
		});
	});
});
