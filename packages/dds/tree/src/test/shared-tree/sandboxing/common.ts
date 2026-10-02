/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fluidHandleSymbol, type IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { isStableId, type SessionId } from "@fluidframework/id-compressor/internal";
import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";
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
 * Session options shared by the Host and Guest endpoints.
 */
export interface SandboxEndpointOptions {
	/** This endpoint's port in the Host and Guest message channel. */
	readonly port: MessagePort;
	/** The endpoint-scoped logger for diagnostic telemetry. */
	readonly logger?: TelemetryLoggerExt;
	// TODO: Replace this callback with a `Listenable` event API for session errors and closure.
	/**
	 * Reports terminal session failure asynchronously.
	 * By default, the error is thrown. After a failure, the application must recreate the Host and Guest pair.
	 */
	readonly handleProtocolError?: (error: Error) => void;
}

/**
 * A violation of the sandbox protocol's data or state requirements.
 * Used by either endpoint, including shared validation on send and receive.
 * This identifies the failed contract, not which participant is at fault.
 *
 * TODO: Ensure we have an established pattern for communicating a telemetry safe portion of the message,
 * and a separate one which might include document contents directly.
 */
export class SandboxProtocolError extends Error {
	public override readonly name = "SandboxProtocolError";
}

/** Shared wire bounds for nonnegative safe integers. */
const nonNegativeSafeIntegerOptions = {
	minimum: 0,
	maximum: Number.MAX_SAFE_INTEGER,
	multipleOf: 1,
} as const;

/** An integer from zero through the largest integer JavaScript can represent exactly. */
const NonNegativeSafeInteger = Type.Number(nonNegativeSafeIntegerOptions);

/**
 * An index into the Host's table of handles authorized for one Guest.
 * Valid only within the owning session; the brand does not establish runtime authorization.
 */
export type HandleToken = Brand<number, "sandbox.HandleToken">;
const HandleToken = brandedNumberType<HandleToken>(nonNegativeSafeIntegerOptions);

/**
 * Identifies one pending {@link BlobRequestMessage}, independently of its {@link HandleToken}.
 * Allocated by the Guest and echoed by the Host to match a response to its request.
 */
export type BlobRequestId = Brand<number, "sandbox.BlobRequestId">;
const BlobRequestId = brandedNumberType<BlobRequestId>(nonNegativeSafeIntegerOptions);

/**
 * Identifies one Host branch update and its acknowledgment.
 */
export type HostUpdateId = Brand<number, "sandbox.HostUpdateId">;
const HostUpdateId = brandedNumberType<HostUpdateId>(nonNegativeSafeIntegerOptions);

/** Identifies a finalized ID creation range sent from the Host to the Guest. */
export type HostIdRangeId = Brand<number, "sandbox.HostIdRangeId">;
const HostIdRangeId = brandedNumberType<HostIdRangeId>(nonNegativeSafeIntegerOptions);

/**
 * Identifies one Guest change and its acknowledgment.
 */
export type GuestChangeId = Brand<number, "sandbox.GuestChangeId">;
const GuestChangeId = brandedNumberType<GuestChangeId>(nonNegativeSafeIntegerOptions);

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
 * Created as a frozen null-prototype record by {@link createBufferPlaceholder}.
 * Its identity in {@link transportBuffers}, not its shape, associates it with a buffer.
 * Ordinary data with the same property remains ordinary data.
 *
 * Placeholders are not sent over the wire: encoding replaces them with buffers, and receiving creates new placeholders.
 * {@link validateTreePayloadVocabulary} rejects registered placeholders; {@link parseHostGuestMessage} unwraps only validated blob-response fields for application use.
 */
interface BufferPlaceholder {
	/** Describes the placeholder shape; this property alone does not establish buffer identity. */
	readonly arrayBufferMarker: true;
}

/**
 * Associates local placeholder identities with buffers without keeping otherwise unreachable placeholders alive.
 */
const transportBuffers = new WeakMap<object, ArrayBuffer>();

/**
 * Hides a copied transport buffer from schema validation behind an identity-checked {@link BufferPlaceholder}.
 */
export function createBufferPlaceholder(buffer: ArrayBuffer): BufferPlaceholder {
	const record: object = Object.create(null);
	const placeholder = Object.freeze(
		Object.assign(record, { arrayBufferMarker: true as const }),
	);
	transportBuffers.set(placeholder, buffer);
	return placeholder;
}

/**
 * Retrieves a buffer only for a placeholder registered by {@link createBufferPlaceholder}, never for a shape lookalike.
 */
export function getTransportBuffer(value: object): ArrayBuffer | undefined {
	return transportBuffers.get(value);
}

/**
 * Recognizes {@link BufferPlaceholder} identities registered in {@link transportBuffers}, rejecting shape lookalikes and raw buffers.
 */
const RegisteredBufferPlaceholder = TypeSystem.Type<BufferPlaceholder>(
	"Sandbox.RegisteredBufferPlaceholder",
	(_schema, value) =>
		typeof value === "object" && value !== null && transportBuffers.has(value),
)();

/**
 * Treats handles recognized by {@link isLocalHandle} as opaque leaves during {@link TreePayloadVocabulary} validation.
 */
const LocalHandle = TypeSystem.Type<IFluidHandle>("Sandbox.LocalHandle", (_schema, value) =>
	isLocalHandle(value),
)();
/**
 * Restricts payload records to null prototypes and excludes registered {@link BufferPlaceholder} identities.
 * {@link TreePayloadVocabulary} separately validates property values.
 */
const NullPrototypeRecord = TypeSystem.Type<Record<string, unknown>>(
	"Sandbox.NullPrototypeRecord",
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
 * {@link LocalHandle} must precede {@link NullPrototypeRecord} so validation treats handles as opaque leaves.
 */
const TreePayloadVocabulary = Type.Recursive((Self) =>
	Type.Union([
		LocalHandle,
		Type.Null(),
		Type.Undefined(),
		Type.Boolean(),
		Type.Number(),
		Type.String(),
		Type.Array(Self),
		Type.Intersect([NullPrototypeRecord, Type.Record(Type.String(), Self)]),
	]),
);
// TODO: Verify that existing tree codecs reject restored handles in structural-record positions,
// including record-node data, without traversing handle internals or invoking getters.

/**
 * TypeBox-backed format validator used by sandbox protocol codecs and trees.
 * @remarks
 * Sandbox validation must not implicitly inherit a SharedTree's configured validator because it may
 * be a no-op and is not configured to enforce the sandbox protocol boundary.
 *
 * This reexporting alias exists to centralize the policy of which format validator is used within the sandbox.
 * Technically, we probably don't need to use this inside the guest, or for validating output from the host,
 * but for now we use it for everything in both.
 */
export const sandboxFormatValidator = FormatValidatorBasic;

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
const validator = extractJsonValidator(sandboxFormatValidator);
const handleTokenValidator = validator.compile(HandleToken);
const serializedHandleValidator = validator.compile(SerializedHandle);
const escapedObjectValidator = validator.compile(EscapedObject);
const treePayloadVocabularyValidator = validator.compile(TreePayloadVocabulary);

/**
 * Checks {@link EscapedObject} structure after the transport has copied and restricted its value types.
 */
export function isEscapedObject(value: unknown): value is Static<typeof EscapedObject> {
	return escapedObjectValidator.check(value);
}

/**
 * Checks the {@link TreePayloadVocabulary} value vocabulary before existing tree codecs inspect the payload.
 */
export function validateTreePayloadVocabulary(value: unknown): void {
	if (!treePayloadVocabularyValidator.check(value)) {
		throw new SandboxProtocolError("Invalid sandbox tree payload.");
	}
}

/**
 * Validates the complete {@link SerializedHandle} record.
 */
export function isSerializedHandle(value: unknown): value is SerializedHandle {
	return serializedHandleValidator.check(value);
}

/** Runtime schema for revision tags used within one sandbox session. */
const SessionRevisionTag = Type.Unsafe<RevisionTag>(
	Type.Union([Type.Literal("root"), Type.Number({ multipleOf: 1 })]),
);

/** A serialized SharedTree payload validated against the sandbox transport vocabulary. */
const SerializedTreePayload = Type.Unsafe<JsonCompatibleReadOnly>(TreePayloadVocabulary);

/** Serialized SharedTree commits in application order. */
const SerializedTreeCommits = Type.Unsafe<readonly JsonCompatibleReadOnly[]>(
	Type.Array(TreePayloadVocabulary),
);

/**
 * Checks the ID format of an ID space shard token received through the port.
 *
 * @remarks
 * This check does not show that the ID space shard belongs to this Host session.
 * The Host checks that separately before it uses the token.
 */
const IdSpaceShardSessionId = TypeSystem.Type<SessionId>(
	"Sandbox.IdSpaceShardSessionId",
	(_schema, value) => typeof value === "string" && isStableId(value),
)();

/**
 * Validates the ID space shard token that the Guest sends with each change.
 *
 * @remarks
 * The Host uses this token to learn about new Guest IDs before it decodes the change.
 * A change does not close the Guest session. The Guest can create more IDs after it sends the change.
 * Therefore, this schema requires `disposed: false`.
 * A disposal token would let the Host reclaim the Guest's ID space shard.
 * The Guest must first stop creating IDs. The separate `guestClose` message carries that token.
 */
const GuestIdSpaceShardToken = Type.Object(
	{
		/** Identifies the child shard created for this Host and Guest session. */
		shardId: IdSpaceShardSessionId,
		/** The child's allocation progress after it encodes the Guest change. */
		localGenCount: NonNegativeSafeInteger,
		/** A change cannot request reclamation while the Guest can still create IDs. */
		disposed: Type.Literal(false),
	},
	{ additionalProperties: false },
);

/** A final child token sent only after the Guest stops creating IDs. */
const DisposedGuestIdSpaceShardToken = Type.Object(
	{
		/** Identifies the child shard to reclaim after the Guest stops creating IDs. */
		shardId: IdSpaceShardSessionId,
		/** Final child allocation progress, including all earlier Guest changes. */
		localGenCount: NonNegativeSafeInteger,
		/** Allows the Host to reclaim the stopped child's ID space. */
		disposed: Type.Literal(true),
	},
	{ additionalProperties: false },
);

/** Validates a parent's progress for the Guest ID space shard. */
const ParentIdProgress = Type.Object(
	{
		/** Distinguishes parent progress from a child synchronization token. */
		type: Type.Literal("parentIdProgressForShard"),
		/** Identifies the child that can apply this Host progress. */
		shardId: IdSpaceShardSessionId,
		/** The Host's generation count before a dependent range or change is decoded. */
		localGenCount: NonNegativeSafeInteger,
	},
	{ additionalProperties: false },
);

/**
 * Validates numeric fields in a finalized ID creation range.
 * @remarks
 * It accepts positive integers that JavaScript can represent exactly.
 * This check does not establish that the range is in sequence or that its fields agree.
 * The Guest checks those conditions when it applies the range.
 */
const PositiveSafeInteger = Type.Number({
	minimum: 1,
	maximum: Number.MAX_SAFE_INTEGER,
	multipleOf: 1,
});

/**
 * A range already finalized by the Host runtime, not a request to submit a new range.
 */
const FinalizedIdRange = Type.Object(
	{
		/** Identifies the client session that created the range. */
		sessionId: IdSpaceShardSessionId,
		/** Creation range already finalized by the Host runtime. */
		ids: Type.Object(
			{
				/** The generation count of the range's first ID. */
				firstGenCount: PositiveSafeInteger,
				/** The number of IDs created in the range. */
				count: PositiveSafeInteger,
				/** Capacity requested if the range needs a new cluster. */
				requestedClusterSize: PositiveSafeInteger,
				/** Pairs of starting generation count and number of local IDs. */
				localIdRanges: Type.Array(Type.Tuple([PositiveSafeInteger, PositiveSafeInteger])),
			},
			{ additionalProperties: false },
		),
	},
	{ additionalProperties: false },
);

/**
 * Initializes the Guest's copy of the Host main branch.
 */
export type HostInitializationMessage = Static<typeof HostInitializationMessage>;
const HostInitializationMessage = Type.Object(
	{
		/** Identifies this message as the initial Host branch state. */
		type: Type.Readonly(Type.Literal("hostInitialization")),
		/** Identifies the commit represented by the snapshot. */
		baseRevision: Type.Readonly(SessionRevisionTag),
		/** Identifies the Host main-branch head produced by replaying `commits`. */
		mainRevision: Type.Readonly(SessionRevisionTag),
		/** Identifies a finalized-history boundary in the reconstructed Host branch, which may precede the newest finalized commit. */
		trunkRevision: Type.Readonly(SessionRevisionTag),
		/** The compressed tree at `baseRevision`. */
		tree: Type.Readonly(SerializedTreePayload),
		/** The persisted schema at `baseRevision`. */
		schema: Type.Readonly(SerializedTreePayload),
		/** Serialized commits after `baseRevision`, in application order. */
		commits: Type.Readonly(SerializedTreeCommits),
		/**
		 * Wire string for a {@link @fluidframework/id-compressor/internal#SerializedIdCompressorWithOngoingSession}.
		 * @remarks
		 * Envelope validation checks only the string shape. Guest deserialization validates
		 * the compressor format and confirms it is a child ID space shard.
		 */
		idCompressor: Type.Readonly(Type.String()),
	},
	{ additionalProperties: false },
);

/**
 * Advances the Guest's copy of the Host main branch.
 */
export type HostUpdateMessage = Static<typeof HostUpdateMessage>;
const HostUpdateMessage = Type.Object(
	{
		/** Identifies this message as a Host branch update. */
		type: Type.Readonly(Type.Literal("hostUpdate")),
		/** Identifies this update and the acknowledgment that completes it. */
		updateId: Type.Readonly(HostUpdateId),
		/** Identifies the retained commit after which `commits` replaces the Guest's Host branch. */
		baseRevision: Type.Readonly(SessionRevisionTag),
		/** Identifies the Host main-branch head produced by applying `commits`. */
		mainRevision: Type.Readonly(SessionRevisionTag),
		/** Identifies a finalized-history boundary in the resulting Host branch, which may precede the newest finalized commit. */
		trunkRevision: Type.Readonly(SessionRevisionTag),
		/** Serialized commits after `baseRevision`, in application order. */
		commits: Type.Readonly(SerializedTreeCommits),
		/** Parent ID progress needed before the Guest decodes any commits or revisions. */
		parentIdProgress: Type.Readonly(ParentIdProgress),
	},
	{ additionalProperties: false },
);

/** Delivers one newly finalized creation range ahead of dependent Host updates. */
export type HostIdRangeMessage = Static<typeof HostIdRangeMessage>;
const HostIdRangeMessage = Type.Object(
	{
		/** Identifies this message as a finalized Host ID range. */
		type: Type.Literal("hostIdRange"),
		/** Sequence number for ranges sent to this Guest. */
		rangeId: Type.Readonly(HostIdRangeId),
		/** Lets the Guest recognize Host IDs before finalizing the range. */
		parentIdProgress: Type.Readonly(ParentIdProgress),
		/** The finalized range to apply before dependent Host updates. */
		range: Type.Readonly(FinalizedIdRange),
	},
	{ additionalProperties: false },
);

/**
 * Confirms that the Guest applied one {@link HostUpdateMessage}.
 */
export type HostUpdateAckMessage = Static<typeof HostUpdateAckMessage>;
const HostUpdateAckMessage = Type.Object(
	{
		/** Identifies this message as a Host update acknowledgment. */
		type: Type.Readonly(Type.Literal("hostUpdateAck")),
		/** Identifies the applied Host update. */
		updateId: Type.Readonly(HostUpdateId),
	},
	{ additionalProperties: false },
);

/**
 * A Guest commit and the Host branch revisions on which the Guest based it.
 */
export type GuestChangeMessage = Static<typeof GuestChangeMessage>;
const GuestChangeMessage = Type.Object(
	{
		/** Identifies this message as a Guest-authored change. */
		type: Type.Readonly(Type.Literal("guestChange")),
		/** Identifies this change and the acknowledgment that completes it. */
		changeId: Type.Readonly(GuestChangeId),
		/** Identifies the Host main-branch head that the Guest had acknowledged when it authored the change. */
		mainRevision: Type.Readonly(SessionRevisionTag),
		/** Identifies the Host finalized-history boundary that the Guest had acknowledged. */
		trunkRevision: Type.Readonly(SessionRevisionTag),
		/** The serialized Guest-authored SharedTree change. */
		change: Type.Readonly(SerializedTreePayload),
		/** Child ID space shard progress needed by the Host before it can decode the change. */
		idSpaceShardToken: Type.Readonly(GuestIdSpaceShardToken),
	},
	{ additionalProperties: false },
);

/**
 * Confirms that the Host applied one {@link GuestChangeMessage}.
 */
export type GuestChangeAckMessage = Static<typeof GuestChangeAckMessage>;
const GuestChangeAckMessage = Type.Object(
	{
		/** Identifies this message as a Guest change acknowledgment. */
		type: Type.Readonly(Type.Literal("guestChangeAck")),
		/** Identifies the applied Guest change. */
		changeId: Type.Readonly(GuestChangeId),
	},
	{ additionalProperties: false },
);

/**
 * Notifies the Host that the Guest has terminated and will generate no further changes.
 * @remarks The Host processes previously sent changes first, then may reclaim the Guest's ID space shard.
 */
export type GuestCloseMessage = Static<typeof GuestCloseMessage>;
const GuestCloseMessage = Type.Object(
	{
		/** Identifies the orderly close request. */
		type: Type.Literal("guestClose"),
		/** Final child progress that lets the Host reclaim its ID space. */
		idSpaceShardToken: DisposedGuestIdSpaceShardToken,
	},
	{ additionalProperties: false },
);

/**
 * A message that the Host and the Guest can send through their shared protocol.
 */
export type HostGuestMessage =
	| HostInitializationMessage
	| HostUpdateMessage
	| HostIdRangeMessage
	| HostUpdateAckMessage
	| GuestChangeMessage
	| GuestChangeAckMessage
	| GuestCloseMessage
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
 * Its blob is a registered {@link BufferPlaceholder}, unlike the {@link ArrayBuffer} exposed by {@link BlobResponseMessage}.
 */
const BlobSuccessMessage = Type.Object(
	{
		type: Type.Readonly(Type.Literal("blobResponse")),
		/** Matches the outstanding Guest request. */
		requestId: Type.Readonly(BlobRequestId),
		/** Unwrapped by {@link parseHostGuestMessage} only after the response passes validation. */
		blob: Type.Readonly(RegisteredBufferPlaceholder),
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
const hostInitializationValidator = validator.compile(HostInitializationMessage);
const hostUpdateValidator = validator.compile(HostUpdateMessage);
const hostIdRangeValidator = validator.compile(HostIdRangeMessage);
const hostUpdateAckValidator = validator.compile(HostUpdateAckMessage);
const guestChangeValidator = validator.compile(GuestChangeMessage);
const guestChangeAckValidator = validator.compile(GuestChangeAckMessage);
const guestCloseValidator = validator.compile(GuestCloseMessage);

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
 * @param data - Normalized or decoded message data, with registered {@link BufferPlaceholder} placeholders.
 * @returns The validated protocol message.
 * @throws {@link SandboxProtocolError} if the data is not a valid protocol message envelope.
 */
export function parseHostGuestMessage(data: unknown): HostGuestMessage {
	if (
		typeof data !== "object" ||
		data === null ||
		Object.getPrototypeOf(data) !== null ||
		!Object.hasOwn(data, "type") ||
		!("type" in data)
	) {
		throw new SandboxProtocolError("Invalid Host and Guest protocol message.");
	}

	if (data.type === "hostUpdate" && hostUpdateValidator.check(data)) {
		return data;
	}
	if (data.type === "hostIdRange" && hostIdRangeValidator.check(data)) {
		return data;
	}

	if (data.type === "hostInitialization" && hostInitializationValidator.check(data)) {
		return data;
	}

	if (data.type === "hostUpdateAck" && hostUpdateAckValidator.check(data)) {
		return data;
	}

	if (data.type === "guestChange" && guestChangeValidator.check(data)) {
		return data;
	}

	if (data.type === "guestChangeAck" && guestChangeAckValidator.check(data)) {
		return data;
	}
	if (data.type === "guestClose" && guestCloseValidator.check(data)) {
		return data;
	}

	if (data.type === "sessionFailure" && sessionFailureValidator.check(data)) {
		return data;
	}

	if (data.type === "blobRequest" && blobRequestValidator.check(data)) {
		return data;
	}
	if (data.type === "blobResponse" && blobResponseValidator.check(data)) {
		if ("error" in data) {
			return data;
		}
		const blob = getTransportBuffer(data.blob);
		assert(blob !== undefined, "Validated blob placeholder must have a registered buffer");
		const response: object = Object.create(null);
		return Object.assign(response, {
			type: "blobResponse" as const,
			requestId: data.requestId,
			blob,
		});
	}

	throw new SandboxProtocolError("Invalid Host and Guest protocol message.");
}

/**
 * A synchronization promise and the functions that settle it.
 */
export interface PromiseWithResolvers {
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
export function makePromiseWithResolvers(): PromiseWithResolvers {
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
