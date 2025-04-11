/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { encodeHandleForSerialization } from "@fluidframework/runtime-utils/internal";
import { MockHandle } from "@fluidframework/test-runtime-utils/internal";

import { ContainerMessageType, OutboundContainerRuntimeMessage } from "../../messageTypes.js";
import { ensureContentsDeserialized, serializeOp } from "../../opLifecycle/index.js";

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
			const op: OutboundContainerRuntimeMessage = {
				type: ContainerMessageType.Alias,
				contents: { internalId: "123", alias: "testAlias" },
			};

			const serialized = serializeOp(op);

			assert.strictEqual(serialized, JSON.stringify(op));
		});

		it("should replace Fluid handles with their encoded form", () => {
			const mockHandle = new MockHandle({});
			Object.assign(mockHandle, { foo: "should not be serialized" });

			const op: OutboundContainerRuntimeMessage = {
				type: ContainerMessageType.FluidDataStoreOp,
				contents: { address: "123", contents: { hereIsAHandle: mockHandle } },
			};

			const serialized = serializeOp(op);

			assert(
				!serialized.includes("foo"),
				"Serialized op should not include the handle's properties besides the path",
			);
			assert(
				serialized.includes("__fluid_handle__") &&
					serialized.includes(mockHandle.absolutePath),
				"Serialized op should include the handle's path and encoded form",
			);
		});

		it("should encode an object with already-encoded handles equivalently to JSON.stringify", () => {
			const op: OutboundContainerRuntimeMessage = {
				type: ContainerMessageType.FluidDataStoreOp,
				contents: {
					address: "123",
					contents: {
						alreadyEncodedHandle: encodeHandleForSerialization(new MockHandle({})),
					},
				},
			};

			const serializedWithFunction = serializeOp(op);
			const serializedWithJSONStringify = JSON.stringify(op);

			assert.strictEqual(serializedWithFunction, serializedWithJSONStringify);
		});
	});
});
