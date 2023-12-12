/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
	IEnvelope,
	InboundAttachMessage,
	IAttachMessage,
} from "@fluidframework/runtime-definitions";
import type { IdCreationRange } from "@fluidframework/id-compressor";
import { IDataStoreAliasMessage } from "./dataStore";
import { GarbageCollectionMessage } from "./gc";
import { IChunkedOp } from "./opLifecycle";

/**
 * @alpha
 */
export enum ContainerMessageType {
	// An op to be delivered to store
	FluidDataStoreOp = "component",

	// Creates a new store
	Attach = "attach",

	// Chunked operation.
	ChunkedOp = "chunkedOp",

	// Signifies that a blob has been attached and should not be garbage collected by storage
	BlobAttach = "blobAttach",

	// Ties our new clientId to our old one on reconnect
	Rejoin = "rejoin",

	// Sets the alias of a root data store
	Alias = "alias",

	/**
	 * An op containing an IdRange of Ids allocated using the runtime's IdCompressor since
	 * the last allocation op was sent.
	 * See the [IdCompressor README](./id-compressor/README.md) for more details.
	 */
	IdAllocation = "idAllocation",

	/**
	 * Garbage collection specific op. This is sent by the summarizer client when GC runs. It's used to synchronize GC
	 * state across all clients.
	 */
	GC = "GC",
}

/**
 * How should an older client handle an unrecognized remote op type?
 *
 * @internal
 */
export type CompatModeBehavior =
	/** Ignore the op. It won't be persisted if this client summarizes */
	| "Ignore"
	/** Fail processing immediately. (The container will close) */
	| "FailToProcess";

/**
 * All the info an older client would need to know how to handle an unrecognized remote op type
 *
 * @internal
 */
export interface IContainerRuntimeMessageCompatDetails {
	/** How should an older client handle an unrecognized remote op type? */
	behavior: CompatModeBehavior;
}

/**
 * The unpacked runtime message / details to be handled or dispatched by the ContainerRuntime.
 * Message type are differentiated via a `type` string and contain different contents depending on their type.
 *
 * IMPORTANT: when creating one to be serialized, set the properties in the order they appear here.
 * This way stringified values can be compared.
 */
interface TypedContainerRuntimeMessage<TType extends ContainerMessageType, TContents>
	extends Partial<RecentlyAddedContainerRuntimeMessageDetails> {
	/** Type of the op, within the ContainerRuntime's domain */
	type: TType;
	/** Domain-specific contents, interpreted according to the type */
	contents: TContents;
}

/**
 * Additional details expected for any recently added message.
 * @internal
 */
export interface RecentlyAddedContainerRuntimeMessageDetails {
	/** Info describing how to handle this op in case the type is unrecognized (default: fail to process) */
	compatDetails: IContainerRuntimeMessageCompatDetails;
}

export type ContainerRuntimeDataStoreOpMessage = TypedContainerRuntimeMessage<
	ContainerMessageType.FluidDataStoreOp,
	IEnvelope
>;
export type InboundContainerRuntimeAttachMessage = TypedContainerRuntimeMessage<
	ContainerMessageType.Attach,
	InboundAttachMessage
>;
export type OutboundContainerRuntimeAttachMessage = TypedContainerRuntimeMessage<
	ContainerMessageType.Attach,
	IAttachMessage
>;
export type ContainerRuntimeChunkedOpMessage = TypedContainerRuntimeMessage<
	ContainerMessageType.ChunkedOp,
	IChunkedOp
>;
export type ContainerRuntimeBlobAttachMessage = TypedContainerRuntimeMessage<
	ContainerMessageType.BlobAttach,
	undefined
>;
export type ContainerRuntimeRejoinMessage = TypedContainerRuntimeMessage<
	ContainerMessageType.Rejoin,
	undefined
>;
export type ContainerRuntimeAliasMessage = TypedContainerRuntimeMessage<
	ContainerMessageType.Alias,
	IDataStoreAliasMessage
>;
export type ContainerRuntimeIdAllocationMessage = TypedContainerRuntimeMessage<
	ContainerMessageType.IdAllocation,
	IdCreationRange
>;
export type ContainerRuntimeGCMessage = TypedContainerRuntimeMessage<
	ContainerMessageType.GC,
	GarbageCollectionMessage
>;

/**
 * Represents an unrecognized {@link TypedContainerRuntimeMessage}, e.g. a message from a future version of the container runtime.
 * @internal
 */
export interface UnknownContainerRuntimeMessage
	extends Partial<RecentlyAddedContainerRuntimeMessageDetails> {
	/** Invalid type of the op, within the ContainerRuntime's domain. This value should never exist at runtime.
	 * This is useful for type narrowing but should never be used as an actual message type at runtime.
	 * Actual value will not be "__unknown...", but the type `Exclude<string, ContainerMessageType>` is not supported.
	 */
	type: "__unknown_container_message_type__never_use_as_value__";

	/** Domain-specific contents, but not decipherable by an unknown op. */
	contents: unknown;
}

/**
 * A {@link TypedContainerRuntimeMessage} that is received from the server and will be processed by the container runtime.
 */
export type InboundContainerRuntimeMessage =
	| ContainerRuntimeDataStoreOpMessage
	| InboundContainerRuntimeAttachMessage
	| ContainerRuntimeChunkedOpMessage
	| ContainerRuntimeBlobAttachMessage
	| ContainerRuntimeRejoinMessage
	| ContainerRuntimeAliasMessage
	| ContainerRuntimeIdAllocationMessage
	| ContainerRuntimeGCMessage
	// Inbound messages may include unknown types from other clients, so we include that as a special case here
	| UnknownContainerRuntimeMessage;

/** A {@link TypedContainerRuntimeMessage} that has been generated by the container runtime but is not yet being sent to the server. */
export type LocalContainerRuntimeMessage =
	| ContainerRuntimeDataStoreOpMessage
	| OutboundContainerRuntimeAttachMessage
	| ContainerRuntimeChunkedOpMessage
	| ContainerRuntimeBlobAttachMessage
	| ContainerRuntimeRejoinMessage
	| ContainerRuntimeAliasMessage
	| ContainerRuntimeIdAllocationMessage
	| ContainerRuntimeGCMessage
	// In rare cases (e.g. related to stashed ops) we could have a local message of an unknown type
	| UnknownContainerRuntimeMessage;

/** A {@link TypedContainerRuntimeMessage} that is being sent to the server from the container runtime. */
export type OutboundContainerRuntimeMessage =
	| ContainerRuntimeDataStoreOpMessage
	| OutboundContainerRuntimeAttachMessage
	| ContainerRuntimeChunkedOpMessage
	| ContainerRuntimeBlobAttachMessage
	| ContainerRuntimeRejoinMessage
	| ContainerRuntimeAliasMessage
	| ContainerRuntimeIdAllocationMessage
	| ContainerRuntimeGCMessage;

/**
 * An unpacked ISequencedDocumentMessage with the inner TypedContainerRuntimeMessage type/contents/etc
 * promoted up to the outer object
 */
export type InboundSequencedContainerRuntimeMessage = Omit<
	ISequencedDocumentMessage,
	"type" | "contents"
> &
	InboundContainerRuntimeMessage;

/** Essentially ISequencedDocumentMessage except that `type` is not `string` to enable narrowing
 * as `Exclude<string, InboundContainerRuntimeMessage['type']>` is not supported.
 * There should never be a runtime value of "__not_a_...".
 * Currently additionally replaces `contents` type until protocol-definitions update is taken with `unknown` instead of `any`.
 */
type InboundSequencedNonContainerRuntimeMessage = Omit<
	ISequencedDocumentMessage,
	"type" | "contents"
> & { type: "__not_a_container_runtime_message_type__"; contents: unknown };

export type InboundSequencedContainerRuntimeMessageOrSystemMessage =
	| InboundSequencedContainerRuntimeMessage
	| InboundSequencedNonContainerRuntimeMessage;

/** A [loose] InboundSequencedContainerRuntimeMessage that is recent and may contain compat details.
 * It exists solely to to provide access to those details.
 */
export type InboundSequencedRecentlyAddedContainerRuntimeMessage = ISequencedDocumentMessage &
	Partial<RecentlyAddedContainerRuntimeMessageDetails>;

/**
 * The unpacked runtime message / details to be handled or dispatched by the ContainerRuntime
 *
 * IMPORTANT: when creating one to be serialized, set the properties in the order they appear here.
 * This way stringified values can be compared.
 *
 * @deprecated this is an internal type which should not be used outside of the package.
 * Internally, it is superseded by `TypedContainerRuntimeMessage`.
 *
 * @internal
 */
export interface ContainerRuntimeMessage {
	/** Type of the op, within the ContainerRuntime's domain */
	type: ContainerMessageType;
	/** Domain-specific contents, interpreted according to the type */
	contents: any;
	/** Info describing how to handle this op in case the type is unrecognized (default: fail to process) */
	compatDetails?: IContainerRuntimeMessageCompatDetails;
}
