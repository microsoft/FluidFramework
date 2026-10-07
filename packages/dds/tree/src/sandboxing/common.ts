/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	fluidHandleSymbol,
	type IFluidHandle,
	type ITelemetryBaseProperties,
} from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { isStableId, type SessionId } from "@fluidframework/id-compressor/internal";
import {
	LoggingError,
	TelemetryDataTag,
	UsageError,
} from "@fluidframework/telemetry-utils/internal";
import * as Type from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
// eslint-disable-next-line import-x/no-internal-modules -- Supported TypeBox custom-type API.
import { TypeSystem } from "@sinclair/typebox/system";

import { extractJsonValidator, unionOptions } from "../codec/index.js";
import type { RevisionTag } from "../core/index.js";
import { FormatValidatorBasic } from "../external-utilities/index.js";
import { type Brand, brandedNumberType, type JsonCompatibleReadOnly } from "../util/index.js";

/**
 * Kind of failure reported across the sandbox boundary.
 * @remarks
 * This is a fixed set of options instead of free form strings so these values from the Guest
 * can be included in host telemetry without risk of exposing sensitive data
 * which a compromised Guest could have included.
 *
 * Currently these are just a few rough categories of errors,
 * but the set can be extended to provide finer grained reporting.
 *
 * Each of these has an extended message in {@link sandboxFailureDescriptions}
 * which can serve as documentation for it.
 */
export enum SandboxFailureCode {
	ProtocolViolation = "protocolViolation",
	ApplicationUsageError = "applicationUsageError",
	ProcessingFailure = "processingFailure",
}

/**
 * Descriptions for {@link SandboxFailureCode} values.
 * @remarks
 * For privacy reasons, we have a fixed set of {@link SandboxFailureCode} values instead of free form strings.
 *
 * As {@link SandboxFailureCode}'s exist for telemetry compatibility, it is nice to use short stable searchable strings for them.
 * We also provide human-readable descriptions for each code for use in the error message prose.
 * These descriptions provide that.
 */
export const sandboxFailureDescriptions: Readonly<Record<SandboxFailureCode, string>> = {
	[SandboxFailureCode.ProtocolViolation]: "Sandbox protocol violation.",
	[SandboxFailureCode.ApplicationUsageError]: "Invalid sandbox application use.",
	[SandboxFailureCode.ProcessingFailure]: "Sandbox processing failed.",
};

/**
 * A violation of the sandbox protocol's data or state requirements.
 * @remarks
 * Used by either endpoint, including shared validation on send and receive.
 * This identifies the failed contract, not which participant is at fault.
 * Includes failures reported by a peer that terminate the local session;
 * see {@link SandboxProtocolError.fromPeerMessage} for constructing such errors.
 *
 * On the Host, tag otherwise-unclassified Guest protocol properties as `SandboxGuestData`.
 * Guest properties that may contain schema or sensitive data require `UserData` tagging.
 */
export class SandboxProtocolError extends LoggingError {
	public override readonly name = "SandboxProtocolError";

	public constructor(
		/**
		 * A message that is safe to include in telemetry and logs.
		 * @remarks
		 * Must not contain {@link TelemetryDataTag.SandboxGuestData | Guest-controlled information},
		 * nor any other sensitive data which needs tagging.
		 */
		safeMessage: string,
		options?: {
			readonly telemetryProperties?: ITelemetryBaseProperties;
			readonly cause?: unknown;
		},
	) {
		super(safeMessage, options?.telemetryProperties);
		this.cause = options?.cause;
	}

	/**
	 * Constructs a local error from a schema-validated peer failure notification.
	 * Peer-provided diagnostic strings are never used as the local error's message.
	 *
	 * @param message - The validated failure notification.
	 * @param peer - The endpoint that sent the notification, not the receiving endpoint.
	 */
	public static fromPeerMessage(
		message: SessionFailureMessage,
		peer: "Host" | "Guest",
	): SandboxProtocolError {
		const prefix = peer === "Guest" ? "fromGuest" : "fromHost";
		// The validated code is safe to log, but remains a peer-reported diagnosis.
		const telemetryProperties: ITelemetryBaseProperties = {
			[`${prefix}Code`]: message.code,
		};
		if (message.protocolMessage !== undefined) {
			telemetryProperties[prefix] =
				peer === "Guest"
					? {
							tag: TelemetryDataTag.SandboxGuestData,
							value: message.protocolMessage,
						}
					: message.protocolMessage;
		}
		if (message.sensitiveMessage !== undefined) {
			telemetryProperties[`${prefix}Sensitive`] = {
				tag: TelemetryDataTag.UserData,
				value: message.sensitiveMessage,
			};
		}
		return new SandboxProtocolError(
			`The ${peer} reported a sandbox session failure. ${sandboxFailureDescriptions[message.code]}`,
			{
				telemetryProperties,
			},
		);
	}
}

/** Shared wire bounds for nonnegative safe integers. */
const nonNegativeSafeIntegerOptions = {
	minimum: 0,
	maximum: Number.MAX_SAFE_INTEGER,
	multipleOf: 1,
} as const;

/** An integer from zero through the largest integer JavaScript can represent exactly. */
const NonNegativeSafeInteger = Type.Number(nonNegativeSafeIntegerOptions);

/** Shared wire bounds for positive safe integers. */
const PositiveSafeInteger = Type.Number({
	minimum: 1,
	maximum: Number.MAX_SAFE_INTEGER,
	multipleOf: 1,
});

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
 * {@link validateTreePayloadVocabulary} rejects registered placeholders; the Guest unwraps only a validated blob-response field for application use.
 */
export interface BufferPlaceholder {
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
	if (Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype) {
		throw new SandboxProtocolError("Unsupported sandbox transport object.");
	}
	if (Reflect.ownKeys(buffer).length > 0) {
		throw new SandboxProtocolError("Sandbox buffers cannot have custom properties.");
	}
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
 * The sandbox uses the same validator for protocol schemas and tree codecs.
 * It does not inherit the Host SharedTree's configured validator because that validator can be a no-op
 * and is not configured to enforce the sandbox protocol boundary.
 */
export const sandboxFormatValidator = FormatValidatorBasic;

/**
 * The sandbox always validates protocol data, including handle and blob messages.
 * This policy accepts the bundle-size and runtime cost to prevent accidental omission at the boundary.
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

/**
 * Wire representation of {@link @fluidframework/id-compressor/internal#ParentShardSynchronizationToken}.
 *
 * @remarks
 * The Host sends this ID space shard token to the Guest in {@link HostUpdateMessage} and
 * {@link HostIdRangeMessage}. The Guest applies it to its child compressor before
 * decoding Host branch commits or finalizing an ID creation range.
 */
const ParentIdSpaceShardSyncToken = Type.Object(
	{
		/** Distinguishes parent-to-child synchronization from child-to-parent synchronization. */
		type: Type.Literal("parentIdSpaceShardSyncToken"),
		/** Identifies the child ID space shard that can apply this token. */
		shardId: IdSpaceShardSessionId,
		/** Current parent generation count before a dependent range or change is decoded. */
		localGenCount: NonNegativeSafeInteger,
	},
	{ additionalProperties: false },
);

/**
 * An {@link @fluidframework/id-compressor/internal#IdCreationRange} already finalized by the Host runtime.
 *
 * @remarks
 * This schema requires a nonempty range; it is not a request to finalize one.
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
 * A Host-to-Guest transition of the Host's main branch.
 *
 * @remarks This can include Host edits, peer edits, and Guest edits merged by the Host.
 */
export type HostUpdateMessage = Static<typeof HostUpdateMessage>;
const HostUpdateMessage = Type.Object(
	{
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
		/** Parent ID space shard token needed before the Guest decodes commits or revisions. */
		parentIdSpaceShardSyncToken: Type.Readonly(ParentIdSpaceShardSyncToken),
	},
	{ additionalProperties: false },
);

/**
 * Sends a newly finalized creation range from the Host to the Guest.
 *
 * @remarks The Guest applies it before a dependent {@link HostUpdateMessage}.
 * The range may have originated with the Host or another client.
 */
export type HostIdRangeMessage = Static<typeof HostIdRangeMessage>;
const HostIdRangeMessage = Type.Object(
	{
		/** Sequence number for ranges sent to this Guest. */
		rangeId: Type.Readonly(HostIdRangeId),
		/** Synchronizes the Guest's child ID space shard before it finalizes the range. */
		parentIdSpaceShardSyncToken: Type.Readonly(ParentIdSpaceShardSyncToken),
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
		/** Identifies the applied Guest change. */
		changeId: Type.Readonly(GuestChangeId),
	},
	{ additionalProperties: false },
);

/**
 * Terminal notification in either direction. The application must recreate the Host/Guest pair.
 * Delivery is only possible while the transport still works; this message is not acknowledged.
 */
export type SessionFailureMessage = Static<typeof SessionFailureMessage>;
const SessionFailureMessage = Type.Object(
	{
		/** A bounded, peer-reported classification. Receivers use their own description. */
		code: Type.Enum(SandboxFailureCode),
		/**
		 * Protocol-only diagnostics. An uncompromised sender must not put schema or sensitive data here.
		 * The Host treats this as `SandboxGuestData`, regardless of the reported code.
		 */
		protocolMessage: Type.Optional(Type.String()),
		/** Potentially sensitive diagnostics. Receivers must tag this as `UserData`. */
		sensitiveMessage: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

/**
 * Guest-to-Host request to resolve an authorized {@link HandleToken} as a blob.
 * The Host returns a `blobResponse` or `blobResponseError` member with the same
 * {@link BlobRequestId}.
 */
export type BlobRequestMessage = Static<typeof BlobRequestMessage>;
const BlobRequestMessage = Type.Object(
	{
		/** Identifies this pending resolution, independently of the handle token. */
		requestId: Type.Readonly(BlobRequestId),
		/** Identifies the handle to resolve in the Host's session-local table. */
		token: Type.Readonly(HandleToken),
	},
	{ additionalProperties: false },
);

/**
 * Validation representation of a successful Host-to-Guest blob response.
 * Its blob is a registered {@link BufferPlaceholder}.
 */
const BlobSuccessMessage = Type.Object(
	{
		/** Matches the outstanding Guest request. */
		requestId: Type.Readonly(BlobRequestId),
		/** Unwrapped by the Guest only after the response passes validation. */
		blob: Type.Readonly(RegisteredBufferPlaceholder),
	},
	{ additionalProperties: false },
);
/**
 * Host-to-Guest resolution failure. Mutually exclusive with {@link BlobSuccessMessage}.
 */
const BlobErrorMessage = Type.Object(
	{
		/** Matches the outstanding Guest request. */
		requestId: Type.Readonly(BlobRequestId),
		/** Error message used to reject the Guest proxy's cached resolution promise. */
		error: Type.Readonly(Type.String()),
	},
	{ additionalProperties: false },
);
/**
 * A normalized Host-to-Guest protocol message.
 *
 * @remarks
 * A successful blob response still contains its registered {@link BufferPlaceholder}.
 * The Guest unwraps that field before passing the response to application-facing logic.
 */
export type HostToGuestMessage = Static<typeof hostToGuestMessageSchema>;
const hostToGuestMessageSchema = Type.Object(
	{
		/** Initializes the Guest with a {@link HostInitializationMessage}. */
		hostInitialization: Type.Optional(HostInitializationMessage),
		/** Updates the Guest's copy of the Host branch with a {@link HostUpdateMessage}. */
		hostUpdate: Type.Optional(HostUpdateMessage),
		/** Sends the Guest a finalized ID range in a {@link HostIdRangeMessage}. */
		hostIdRange: Type.Optional(HostIdRangeMessage),
		/** Acknowledges a {@link GuestChangeMessage} with a {@link GuestChangeAckMessage}. */
		guestChangeAck: Type.Optional(GuestChangeAckMessage),
		/** Returns the resolved buffer for a {@link BlobRequestMessage}. */
		blobResponse: Type.Optional(BlobSuccessMessage),
		/** Reports that the Host could not resolve a {@link BlobRequestMessage}. */
		blobResponseError: Type.Optional(BlobErrorMessage),
		/**
		 * Reports a terminal Host failure to the Guest.
		 * The Guest stops the session without sending another failure notification.
		 */
		sessionFailure: Type.Optional(SessionFailureMessage),
	},
	unionOptions,
);

/**
 * A normalized Guest-to-Host protocol message.
 */
export type GuestToHostMessage = Static<typeof guestToHostMessageSchema>;
const guestToHostMessageSchema = Type.Object(
	{
		/** Acknowledges a {@link HostUpdateMessage} with a {@link HostUpdateAckMessage}. */
		hostUpdateAck: Type.Optional(HostUpdateAckMessage),
		/** Sends a Guest-authored change in a {@link GuestChangeMessage}. */
		guestChange: Type.Optional(GuestChangeMessage),
		/** Requests that the Host resolve an authorized blob with a {@link BlobRequestMessage}. */
		blobRequest: Type.Optional(BlobRequestMessage),
		/**
		 * Reports a terminal Guest failure to the Host.
		 * The Host stops the session without sending another failure notification.
		 */
		sessionFailure: Type.Optional(SessionFailureMessage),
	},
	unionOptions,
);

export const hostToGuestMessageValidator = validator.compile(hostToGuestMessageSchema);
export const guestToHostMessageValidator = validator.compile(guestToHostMessageSchema);

/**
 * Checks the numeric format of a {@link HandleToken}, not its authorization.
 */
export function isHandleToken(value: unknown): value is HandleToken {
	return handleTokenValidator.check(value);
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
	assert(resolver !== undefined, 0xd57 /* Resolve function should have been assigned */);
	assert(rejecter !== undefined, 0xd58 /* Reject function should have been assigned */);
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
 * Returns an error message that is safe to send across the sandbox boundary.
 */
export function getTelemetrySafeProtocolErrorMessage(error: unknown): string {
	const normalized = normalizeProtocolError(error);
	return LoggingError.typeCheck(normalized)
		? normalized.message
		: "Host and Guest protocol processing failed.";
}

/**
 * Classifies a local error without inspecting its diagnostic text.
 */
export function getSandboxFailureCode(error: Error): SandboxFailureCode {
	return error instanceof SandboxProtocolError
		? SandboxFailureCode.ProtocolViolation
		: error instanceof UsageError
			? SandboxFailureCode.ApplicationUsageError
			: SandboxFailureCode.ProcessingFailure;
}

/**
 * Creates a failure notification without invoking a tree or transport codec.
 * Only SandboxProtocolError messages are promoted to the protocol-only field.
 * Their constructor requires messages without Guest-controlled or sensitive data.
 * Nested causes remain potentially sensitive, regardless of their error type.
 * Receivers tag sensitive diagnostics as `UserData`.
 */
export function createSessionFailureMessage(error: Error): SessionFailureMessage {
	const code = getSandboxFailureCode(error);
	const protocolMessage = error instanceof SandboxProtocolError ? error.message : undefined;
	const sensitiveMessage =
		error instanceof SandboxProtocolError
			? error.cause === undefined
				? undefined
				: normalizeProtocolError(error.cause).message
			: error.message;
	return {
		code,
		...(protocolMessage === undefined ? undefined : { protocolMessage }),
		...(sensitiveMessage === undefined ? undefined : { sensitiveMessage }),
	};
}

/**
 * Gets the revision of a serialized change.
 * Used for debugging and logging purposes only.
 */
export function getRevision(change: JsonCompatibleReadOnly): RevisionTag {
	return (change as unknown as { revision: RevisionTag }).revision;
}
