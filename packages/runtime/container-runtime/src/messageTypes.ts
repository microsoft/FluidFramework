/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import type { IdCreationRange } from "@fluidframework/id-compressor/internal";
import type {
	FluidDataStoreMessage,
	IAttachMessage,
	IEnvelope,
	InboundAttachMessage,
} from "@fluidframework/runtime-definitions/internal";

import { IDataStoreAliasMessage } from "./dataStore.js";
import { GarbageCollectionMessage } from "./gc/index.js";
import { IChunkedOp } from "./opLifecycle/index.js";
import { IDocumentSchemaChangeMessage } from "./summary/index.js";

/**
 * @legacy
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
	 * An op that changes document schema
	 */
	DocumentSchemaChange = "schema",

	/**
	 * Garbage collection specific op. This is sent by the summarizer client when GC runs. It's used to synchronize GC
	 * state across all clients.
	 */
	GC = "GC",
}

/**
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace InternalUtilityTypes {
	/**
	 * The unpacked runtime message / details to be handled or dispatched by the ContainerRuntime.
	 * Message type are differentiated via a `type` string and contain different contents depending on their type.
	 *
	 * IMPORTANT: when creating one to be serialized, set the properties in the order they appear here.
	 * This way stringified values can be compared.
	 */
	export interface TypedContainerRuntimeMessage<
		TType extends ContainerMessageType,
		TContents,
	> {
		/**
		 * Type of the op, within the ContainerRuntime's domain
		 */
		type: TType;
		/**
		 * Domain-specific contents, interpreted according to the type
		 */
		contents: TContents;
	}
}

/**
 * @internal
 */
export type ContainerRuntimeDataStoreOpMessage =
	InternalUtilityTypes.TypedContainerRuntimeMessage<
		ContainerMessageType.FluidDataStoreOp,
		IEnvelope<FluidDataStoreMessage>
	>;
export type InboundContainerRuntimeAttachMessage =
	InternalUtilityTypes.TypedContainerRuntimeMessage<
		ContainerMessageType.Attach,
		InboundAttachMessage
	>;
/**
 * @internal
 */
export type OutboundContainerRuntimeAttachMessage =
	InternalUtilityTypes.TypedContainerRuntimeMessage<
		ContainerMessageType.Attach,
		IAttachMessage
	>;
export type ContainerRuntimeChunkedOpMessage =
	InternalUtilityTypes.TypedContainerRuntimeMessage<
		ContainerMessageType.ChunkedOp,
		IChunkedOp
	>;
export type ContainerRuntimeBlobAttachMessage =
	InternalUtilityTypes.TypedContainerRuntimeMessage<
		ContainerMessageType.BlobAttach,
		undefined
	>;
export type ContainerRuntimeRejoinMessage = InternalUtilityTypes.TypedContainerRuntimeMessage<
	ContainerMessageType.Rejoin,
	undefined
>;
/**
 * @internal
 */
export type ContainerRuntimeAliasMessage = InternalUtilityTypes.TypedContainerRuntimeMessage<
	ContainerMessageType.Alias,
	IDataStoreAliasMessage
>;
export type ContainerRuntimeIdAllocationMessage =
	InternalUtilityTypes.TypedContainerRuntimeMessage<
		ContainerMessageType.IdAllocation,
		IdCreationRange
	>;
export type ContainerRuntimeGCMessage = InternalUtilityTypes.TypedContainerRuntimeMessage<
	ContainerMessageType.GC,
	GarbageCollectionMessage
>;
export type ContainerRuntimeDocumentSchemaMessage =
	InternalUtilityTypes.TypedContainerRuntimeMessage<
		ContainerMessageType.DocumentSchemaChange,
		IDocumentSchemaChangeMessage
	>;

/**
 * Represents an unrecognized TypedContainerRuntimeMessage, e.g. a message from a future version of the container runtime.
 * @internal
 */
export interface UnknownContainerRuntimeMessage {
	/**
	 * Invalid type of the op, within the ContainerRuntime's domain. This value should never exist at runtime.
	 * This is useful for type narrowing but should never be used as an actual message type at runtime.
	 * Actual value will not be "__unknown...", but the type `Exclude<string, ContainerMessageType>` is not supported.
	 */
	type: "__unknown_container_message_type__never_use_as_value__";

	/**
	 * Domain-specific contents, but not decipherable by an unknown op.
	 */
	contents: unknown;
}

/**
 * A {@link InternalUtilityTypes.TypedContainerRuntimeMessage} that is received from the server and will be processed by the container runtime.
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
	| ContainerRuntimeDocumentSchemaMessage
	// Inbound messages may include unknown types from other clients, so we include that as a special case here
	| UnknownContainerRuntimeMessage;

/**
 * A {@link InternalUtilityTypes.TypedContainerRuntimeMessage} that has been generated by the container runtime, eventually to be sent to the ordering service.
 * These are messages generated by the local runtime, before the outbox's op virtualization step.
 */
export type LocalContainerRuntimeMessage =
	| ContainerRuntimeDataStoreOpMessage
	| OutboundContainerRuntimeAttachMessage
	| ContainerRuntimeBlobAttachMessage
	| ContainerRuntimeRejoinMessage
	| ContainerRuntimeAliasMessage
	| ContainerRuntimeIdAllocationMessage
	| ContainerRuntimeGCMessage
	| ContainerRuntimeDocumentSchemaMessage
	// In rare cases (e.g. related to stashed ops) we could have a local message of an unknown type
	| UnknownContainerRuntimeMessage;

/**
 * An unpacked ISequencedDocumentMessage with the inner TypedContainerRuntimeMessage type/contents/etc
 * promoted up to the outer object
 */
export type InboundSequencedContainerRuntimeMessage = Omit<
	ISequencedDocumentMessage,
	"type" | "contents"
> &
	InboundContainerRuntimeMessage;
