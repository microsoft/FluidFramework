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
 * Valid only within the owning session; the brand does not establish runtime authorization.
 */
export type HandleToken = Brand<number, "sandbox.HandleToken">;
const HandleToken = brandedNumberType<HandleToken>({
	minimum: 0,
	maximum: Number.MAX_SAFE_INTEGER,
	multipleOf: 1,
});

/**
 * Identifies one pending {@link BlobRequestMessage}, independently of its {@link HandleToken}.
 * Allocated by the Guest and echoed by the Host to match a response to its request.
 */
export type BlobRequestId = Brand<number, "sandbox.BlobRequestId">;
const BlobRequestId = brandedNumberType<BlobRequestId>({
	minimum: 0,
	maximum: Number.MAX_SAFE_INTEGER,
	multipleOf: 1,
});

/**
 * Wire discriminator for {@link SerializedHandle}. Ordinary records with this value must be escaped.
 */
export const serializedHandleType = "__sandbox_handle__";
/**
 * Validates the wire marker's shape and token range, not session authorization.
 */
const SerializedHandle = Type.Object(
	{
		type: Type.Readonly(Type.Literal(serializedHandleType)),
		/** Index of the referenced handle in the owning Host session. */
		token: Type.Readonly(HandleToken),
	},
	{ additionalProperties: false },
);

/**
 * A handle's wire representation in initialization data and serialized changes.
 * Restored to a Host handle or Guest proxy before semantic validation and tree-codec decoding.
 */
export type SerializedHandle = Static<typeof SerializedHandle>;

/**
 * Wire discriminator for {@link EscapedObject}. Ordinary records with this value must also be escaped.
 */
export const escapedObjectType = "__sandbox_object__";
/**
 * Wire wrapper for ordinary records whose discriminator collides with a transport marker.
 * Reconstruction preserves the original root as data rather than interpreting it as another marker.
 */
const EscapedObject = Type.Object(
	{
		type: Type.Literal(escapedObjectType),
		/** Own property names and encoded values. The decoder separately rejects duplicate names. */
		entries: Type.Array(Type.Tuple([Type.String(), Type.Unknown()])),
	},
	{ additionalProperties: false },
);

/**
 * Recognizes local {@link IFluidHandle} values by {@link fluidHandleSymbol}, without accepting cloneable legacy lookalikes.
 * Only trusted token restoration introduces handles into received data.
 */
export function isLocalHandle(value: unknown): value is IFluidHandle {
	// TODO: Remove isFluidHandle's legacy string-property fallback (including test-setup dependencies),
	// then use it here. That fallback accepts ordinary data that can cross structured clone.
	return typeof value === "object" && value !== null && fluidHandleSymbol in value;
}

/**
 * Local placeholder that keeps an {@link ArrayBuffer} out of general schema validation.
 * @remarks
 * Created as a frozen null-prototype record by {@link createBufferMarker}.
 * Its identity in {@link transportBuffers}, not its shape, associates it with a buffer.
 * Ordinary data with the same property remains ordinary data.
 *
 * Markers are not sent over the wire: encoding replaces them with buffers, and receiving creates new markers.
 * {@link validateTreePayload} rejects registered markers; {@link parseHostGuestMessage} unwraps only validated blob-response fields for application use.
 */
interface BufferMarker {
	/** Describes the placeholder shape; this property alone does not establish buffer identity. */
	readonly arrayBufferMarker: true;
}

/**
 * Associates local marker identities with buffers without keeping otherwise unreachable markers alive.
 */
const transportBuffers = new WeakMap<object, ArrayBuffer>();

/**
 * Hides a copied transport buffer from schema validation behind an identity-checked {@link BufferMarker}.
 */
export function createBufferMarker(buffer: ArrayBuffer): BufferMarker {
	const record: object = Object.create(null);
	const marker = Object.freeze(Object.assign(record, { arrayBufferMarker: true as const }));
	transportBuffers.set(marker, buffer);
	return marker;
}

/**
 * Retrieves a buffer only for a marker registered by {@link createBufferMarker}, never for a shape lookalike.
 */
export function getTransportBuffer(value: object): ArrayBuffer | undefined {
	return transportBuffers.get(value);
}

/**
 * Recognizes {@link BufferMarker} identities registered in {@link transportBuffers}, rejecting shape lookalikes and raw buffers.
 */
const LocalBuffer = TypeSystem.Type<BufferMarker>(
	"Sandbox.LocalBuffer",
	(_schema, value) =>
		typeof value === "object" && value !== null && transportBuffers.has(value),
)();

/**
 * Treats handles recognized by {@link isLocalHandle} as opaque leaves during {@link TreePayload} validation.
 */
const LocalHandle = TypeSystem.Type<IFluidHandle>("Sandbox.LocalHandle", (_schema, value) =>
	isLocalHandle(value),
)();
/**
 * Restricts payload records to null prototypes and excludes registered {@link BufferMarker} identities.
 * {@link TreePayload} separately validates property values.
 */
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
 * {@link LocalHandle} must precede {@link PlainRecord} so validation treats handles as opaque leaves.
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
 * Checks {@link EscapedObject} structure after the transport has copied and restricted its value types.
 */
export function isEscapedObject(value: unknown): value is Static<typeof EscapedObject> {
	return escapedObjectValidator.check(value);
}

/**
 * Checks the {@link TreePayload} value vocabulary before existing tree codecs inspect the payload.
 */
export function validateTreePayload(value: unknown): void {
	if (!treePayloadValidator.check(value)) {
		throw new Error("Invalid sandbox tree payload.");
	}
}

/**
 * Validates the complete {@link SerializedHandle} record.
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
	| BlobResponseMessage
	| SessionFailureMessage;

/**
 * Terminal notification in either direction. The application must recreate the Host/Guest pair.
 * Delivery is only possible while the transport still works; this message is not acknowledged.
 */
export type SessionFailureMessage = Static<typeof SessionFailureMessage>;
const SessionFailureMessage = Type.Object(
	{
		type: Type.Literal("sessionFailure"),
		/** A diagnostic description, not an error object or stack trace. */
		error: Type.String(),
	},
	{ additionalProperties: false },
);
const sessionFailureValidator = validator.compile(SessionFailureMessage);

/**
 * Guest-to-Host request to resolve an authorized {@link HandleToken} as a blob.
 * The Host returns a {@link BlobResponseMessage} with the same {@link BlobRequestId}.
 */
export type BlobRequestMessage = Static<typeof BlobRequestMessage>;
const BlobRequestMessage = Type.Object(
	{
		type: Type.Readonly(Type.Literal("blobRequest")),
		/** Identifies this pending resolution, independently of the handle token. */
		requestId: Type.Readonly(BlobRequestId),
		/** Identifies the handle to resolve in the Host's session-local table. */
		token: Type.Readonly(HandleToken),
	},
	{ additionalProperties: false },
);

/**
 * Validation representation of a successful Host-to-Guest blob response.
 * Its blob is a registered {@link BufferMarker}, unlike the {@link ArrayBuffer} exposed by {@link BlobResponseMessage}.
 */
const BlobSuccessMessage = Type.Object(
	{
		type: Type.Readonly(Type.Literal("blobResponse")),
		/** Matches the outstanding Guest request. */
		requestId: Type.Readonly(BlobRequestId),
		/** Unwrapped by {@link parseHostGuestMessage} only after the response passes validation. */
		blob: Type.Readonly(LocalBuffer),
	},
	{ additionalProperties: false },
);
/**
 * Host-to-Guest resolution failure. Mutually exclusive with {@link BlobSuccessMessage}.
 */
const BlobErrorMessage = Type.Object(
	{
		type: Type.Readonly(Type.Literal("blobResponse")),
		/** Matches the outstanding Guest request. */
		requestId: Type.Readonly(BlobRequestId),
		/** Error message used to reject the Guest proxy's cached resolution promise. */
		error: Type.Readonly(Type.String()),
	},
	{ additionalProperties: false },
);
const blobRequestValidator = validator.compile(BlobRequestMessage);
const blobResponseValidator = validator.compile(
	Type.Union([BlobSuccessMessage, BlobErrorMessage]),
);

/**
 * Application representation of a Host-to-Guest blob response, containing a buffer or an error.
 * The sender supplies an {@link ArrayBuffer}; the receiver obtains one through {@link parseHostGuestMessage} after placeholder validation and unwrapping.
 * The Guest must also match the request ID against its outstanding requests.
 */
export type BlobResponseMessage =
	| (Omit<Static<typeof BlobSuccessMessage>, "blob"> & { readonly blob: ArrayBuffer })
	| Static<typeof BlobErrorMessage>;

/**
 * Checks the numeric format of a {@link HandleToken}, not its authorization.
 */
export function isHandleToken(value: unknown): value is HandleToken {
	return handleTokenValidator.check(value);
}

/**
 * Validates data from a Host and Guest message channel.
 *
 * @param data - Normalized or decoded message data, with registered {@link BufferMarker} placeholders.
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

	if (data.type === "sessionFailure" && sessionFailureValidator.check(data)) {
		return data;
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
 * A synchronization promise and the functions that settle it.
 */
export interface PromiseWithResolver {
	/** The synchronization operation that a caller can await. */
	readonly promise: Promise<void>;
	/** Resolves the synchronization operation. */
	readonly resolver: () => void;
	/** Rejects synchronization when its session ends before acknowledgment. */
	readonly rejecter: (error: Error) => void;
}

/**
 * Creates a synchronization promise and its settlement functions.
 *
 * @returns The promise, resolver, and rejecter.
 */
export function makePromiseWithResolver(): PromiseWithResolver {
	let resolver: undefined | (() => void);
	let rejecter: undefined | ((error: Error) => void);
	const promise = new Promise<void>((resolve, reject) => {
		resolver = resolve;
		rejecter = reject;
	});
	assert(resolver !== undefined, "Resolve function should have been assigned");
	assert(rejecter !== undefined, "Reject function should have been assigned");
	return { promise, resolver, rejecter };
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
