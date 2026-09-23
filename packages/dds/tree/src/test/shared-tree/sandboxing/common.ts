/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fluidHandleSymbol, type IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import * as Type from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
// eslint-disable-next-line import-x/no-internal-modules -- Supported TypeBox custom-type API.
import { TypeSystem } from "@sinclair/typebox/system";

import { extractJsonValidator } from "../../../codec/index.js";
import type { RevisionTag } from "../../../core/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import {
	type Brand,
	brandedNumberType,
	type JsonCompatibleReadOnly,
} from "../../../util/index.js";

/**
 * An index into the Host's table of handles authorized for one Guest.
 */
export type HandleToken = Brand<number, "sandbox.HandleToken">;
const HandleToken = brandedNumberType<HandleToken>({
	minimum: 0,
	maximum: Number.MAX_SAFE_INTEGER,
	multipleOf: 1,
});

/**
 * Identifies one pending blob request, independently of its handle token.
 */
export type BlobRequestId = Brand<number, "sandbox.BlobRequestId">;
const BlobRequestId = brandedNumberType<BlobRequestId>({
	minimum: 0,
	maximum: Number.MAX_SAFE_INTEGER,
	multipleOf: 1,
});

export const serializedHandleType = "__sandbox_handle__";
const SerializedHandle = Type.Object(
	{
		type: Type.Readonly(Type.Literal(serializedHandleType)),
		token: Type.Readonly(HandleToken),
	},
	{ additionalProperties: false },
);

/**
 * A handle's representation in initialization data and serialized changes.
 */
export type SerializedHandle = Static<typeof SerializedHandle>;

export const escapedObjectType = "__sandbox_object__";
const EscapedObject = Type.Object(
	{
		type: Type.Literal(escapedObjectType),
		entries: Type.Array(Type.Tuple([Type.String(), Type.Unknown()])),
	},
	{ additionalProperties: false },
);

/**
 * Recognizes local handles without accepting cloneable legacy lookalikes.
 * Only trusted token restoration introduces handles into received data.
 */
export function isLocalHandle(value: unknown): value is IFluidHandle {
	// TODO: Remove isFluidHandle's legacy string-property fallback (including test-setup dependencies),
	// then use it here. That fallback accepts ordinary data that can cross structured clone.
	return typeof value === "object" && value !== null && fluidHandleSymbol in value;
}

interface BufferMarker {
	readonly arrayBufferMarker: true;
}

const transportBuffers = new WeakMap<object, ArrayBuffer>();

/**
 * Hides a copied transport buffer from schema validation behind an identity-checked record.
 */
export function createBufferMarker(buffer: ArrayBuffer): BufferMarker {
	const record: object = Object.create(null);
	const marker = Object.freeze(Object.assign(record, { arrayBufferMarker: true as const }));
	transportBuffers.set(marker, buffer);
	return marker;
}

/**
 * Retrieves a buffer only for a locally registered marker, never for a shape lookalike.
 */
export function getTransportBuffer(value: object): ArrayBuffer | undefined {
	return transportBuffers.get(value);
}

const LocalBuffer = TypeSystem.Type<BufferMarker>(
	"Sandbox.LocalBuffer",
	(_schema, value) =>
		typeof value === "object" && value !== null && transportBuffers.has(value),
)();

const LocalHandle = TypeSystem.Type<IFluidHandle>("Sandbox.LocalHandle", (_schema, value) =>
	isLocalHandle(value),
)();
const PlainRecord = TypeSystem.Type<Record<string, unknown>>(
	"Sandbox.PlainRecord",
	(_schema, value) => {
		if (typeof value !== "object" || value === null) {
			return false;
		}
		const prototype: unknown = Object.getPrototypeOf(value);
		return prototype === null && !transportBuffers.has(value);
	},
)();

/**
 * The value vocabulary of decoded tree payloads, not their codec-specific structure.
 * Handles must precede records so validation treats them as opaque leaves.
 */
const TreePayload = Type.Recursive((Self) =>
	Type.Union([
		LocalHandle,
		Type.Null(),
		Type.Undefined(),
		Type.Boolean(),
		Type.Number(),
		Type.String(),
		Type.Array(Self),
		Type.Intersect([PlainRecord, Type.Record(Type.String(), Self)]),
	]),
);
// TODO: Verify that existing tree codecs reject restored handles in structural-record positions,
// including record-node data, without traversing handle internals or invoking getters.

/**
 * The sandbox always enables format validation for handle records and blob messages.
 * @remarks
 * These messages may cross a security boundary,
 * and the validation is an important part of making that robust.
 * To mitigate the risk of accidental omission,
 * the sandbox always enables format validation for these messages.
 * This has a bundle size and performance cost for cases which do not require it.
 * That is an intentional tradeoff.
 *
 * In the future, we could require callers to provide a validator explicitly,
 * allowing alternative implementations or an explicit opt-out for trusted scenarios.
 * Do not implicitly inherit the Host SharedTree's validator:
 * it may be a no-op and is not configured to enforce this security boundary.
 */
const validator = extractJsonValidator(FormatValidatorBasic);
const handleTokenValidator = validator.compile(HandleToken);
const serializedHandleValidator = validator.compile(SerializedHandle);
const escapedObjectValidator = validator.compile(EscapedObject);
const treePayloadValidator = validator.compile(TreePayload);

/**
 * Checks escape structure after the transport has copied and restricted its value types.
 */
export function isEscapedObject(value: unknown): value is Static<typeof EscapedObject> {
	return escapedObjectValidator.check(value);
}

/**
 * Checks the decoded value vocabulary before existing tree codecs inspect the payload.
 */
export function validateTreePayload(value: unknown): void {
	if (!treePayloadValidator.check(value)) {
		throw new Error("Invalid sandbox tree payload.");
	}
}

/**
 * Validates the complete serialized handle record.
 */
export function isSerializedHandle(value: unknown): value is SerializedHandle {
	return serializedHandleValidator.check(value);
}

/**
 * A serialized SharedTree change that one participant sends to the other participant.
 */
export interface DataChangeMessage {
	/** Identifies this message as a data-change message. */
	readonly type: "dataChange";
	/** The serialized SharedTree change to apply. */
	readonly change: JsonCompatibleReadOnly;
}

/**
 * Confirms that the receiver applied one data-change message.
 */
export interface AcknowledgmentMessage {
	/** Identifies this message as an acknowledgment message. */
	readonly type: "acknowledgment";
}

/**
 * A message that the Host and the Guest can send through their shared protocol.
 */
export type HostGuestMessage =
	| DataChangeMessage
	| AcknowledgmentMessage
	| BlobRequestMessage
	| BlobResponseMessage;

/**
 * Requests the blob for a handle authorized for this Guest.
 */
export type BlobRequestMessage = Static<typeof BlobRequestMessage>;
const BlobRequestMessage = Type.Object(
	{
		type: Type.Readonly(Type.Literal("blobRequest")),
		requestId: Type.Readonly(BlobRequestId),
		token: Type.Readonly(HandleToken),
	},
	{ additionalProperties: false },
);

const BlobSuccessMessage = Type.Object(
	{
		type: Type.Readonly(Type.Literal("blobResponse")),
		requestId: Type.Readonly(BlobRequestId),
		blob: Type.Readonly(LocalBuffer),
	},
	{ additionalProperties: false },
);
const BlobErrorMessage = Type.Object(
	{
		type: Type.Readonly(Type.Literal("blobResponse")),
		requestId: Type.Readonly(BlobRequestId),
		error: Type.Readonly(Type.String()),
	},
	{ additionalProperties: false },
);
const blobRequestValidator = validator.compile(BlobRequestMessage);
const blobResponseValidator = validator.compile(
	Type.Union([BlobSuccessMessage, BlobErrorMessage]),
);

/**
 * Returns a copied blob or a resolution error.
 */
export type BlobResponseMessage =
	| (Omit<Static<typeof BlobSuccessMessage>, "blob"> & { readonly blob: ArrayBuffer })
	| Static<typeof BlobErrorMessage>;

/**
 * Checks the numeric format of a handle token, not its authorization.
 */
export function isHandleToken(value: unknown): value is HandleToken {
	return handleTokenValidator.check(value);
}

/**
 * Validates data from a Host and Guest message channel.
 *
 * @param data - Normalized or decoded message data, with registered buffer placeholders.
 * @returns The validated protocol message.
 * @throws An error if the data is not a valid protocol message envelope.
 */
export function parseHostGuestMessage(data: unknown): HostGuestMessage {
	if (
		typeof data !== "object" ||
		data === null ||
		Object.getPrototypeOf(data) !== null ||
		!Object.hasOwn(data, "type") ||
		!("type" in data)
	) {
		throw new Error("Invalid Host and Guest protocol message.");
	}

	if (data.type === "acknowledgment") {
		return data as AcknowledgmentMessage;
	}

	if (data.type === "dataChange" && Object.hasOwn(data, "change") && "change" in data) {
		validateTreePayload(data.change);
		return data as DataChangeMessage;
	}

	if (data.type === "blobRequest" && blobRequestValidator.check(data)) {
		return data;
	}
	if (data.type === "blobResponse" && blobResponseValidator.check(data)) {
		if ("error" in data) {
			return data;
		}
		const blob = getTransportBuffer(data.blob);
		if (blob !== undefined) {
			const response: object = Object.create(null);
			return Object.assign(response, {
				type: "blobResponse" as const,
				requestId: data.requestId,
				blob,
			});
		}
	}

	throw new Error("Invalid Host and Guest protocol message.");
}

/**
 * A promise and the function that resolves it.
 */
export interface PromiseWithResolver {
	/** The synchronization operation that a caller can await. */
	readonly promise: Promise<void>;
	/** Resolves the synchronization operation. */
	readonly resolver: () => void;
}

/**
 * Creates a promise and the function that resolves it.
 *
 * @returns The promise and its resolver.
 */
export function makePromiseWithResolver(): PromiseWithResolver {
	let resolver: undefined | (() => void);
	const promise = new Promise<void>((resolve) => {
		resolver = resolve;
	});
	assert(resolver !== undefined, "Resolve function should have been assigned");
	return { promise, resolver };
}

/**
 * Implements the default protocol-error behavior.
 *
 * @param error - The protocol error to throw.
 * @throws The specified protocol error.
 */
export function throwProtocolError(error: Error): never {
	throw error;
}

/**
 * Converts a thrown value to an error that the protocol-error handler can process.
 *
 * @param error - The value that message processing threw.
 * @returns The original error, or a new error that has the thrown value as its cause.
 */
export function normalizeProtocolError(error: unknown): Error {
	return error instanceof Error
		? error
		: new Error("Host and Guest protocol processing failed.", { cause: error });
}

/**
 * Gets the revision of a serialized change.
 * Used for debugging and logging purposes only.
 */
export function getRevision(change: JsonCompatibleReadOnly): RevisionTag {
	return (change as unknown as { revision: RevisionTag }).revision;
}
