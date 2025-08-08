/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ISequencedDocumentMessage,
	type ITree,
} from "@fluidframework/driver-definitions/internal";
import type { IdCreationRange } from "@fluidframework/id-compressor/internal";
import {
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
 * The unpacked runtime message / details to be handled or dispatched by the ContainerRuntime.
 * Message type are differentiated via a `type` string and contain different contents depending on their type.
 *
 * IMPORTANT: when creating one to be serialized, set the properties in the order they appear here.
 * This way stringified values can be compared.
 */
interface TypedContainerRuntimeMessage<TType extends ContainerMessageType, TContents> {
	/**
	 * Type of the op, within the ContainerRuntime's domain
	 */
	type: TType;
	/**
	 * Domain-specific contents, interpreted according to the type
	 */
	contents: TContents;
}

// Nodes in the payload are either plain strings, or objects with a routing string and optional data.
// Before
type Node2<D = unknown> = string | { data: D };
type Node<R extends string = string, D = unknown> = R | { routing: R; data?: D };
type Id = Node<string, undefined>;
type Item<D = unknown> = Node<string, D>;
type UnknownNode = Node<"__unknown__NOT_A_RUNTIME_VALUE__">;

type Test<T = never> = never extends T ? true : false; // true, so this is a valid type

// [["component"], ["id1"], ["ddsOp"], ["1234", { ... }]]
type AnyNode2D = [string] | [string, unknown];
type BaseNode2D<R extends string = string, D = unknown> = D extends undefined ? [R] : [R, D];
type Router2D<R extends string, D = undefined> = BaseNode2D<R, D>;
type Id2D = BaseNode2D<string, undefined>;
type Item2D<D> = BaseNode2D<string, D>;
type UnknownNode2D = BaseNode2D<"__unknown__NOT_A_RUNTIME_VALUE__">;
export type OtherNode = BaseNode2D<"other", { foo: number }>;
export const sampleId2D: Id2D = ["id1"];
export type RuntimeOp2D_explicit =
	| [["component"], [string], ...AnyNode2D[]]
	| [["attach"], Item2D<AttachData>]
	| [["gc", GarbageCollectionMessage]]
	| [UnknownNode2D];
export type RuntimeOp2D =
	| [Router2D<"component">, Id2D, ...AnyNode2D[]]
	| [Router2D<"attach">, Item2D<AttachData>]
	| [Router2D<"gc", GarbageCollectionMessage>]
	| [UnknownNode2D];

// I had hoped this would support type narrowing on the rest of the tuple based on the first element,
// but it doesn't (see processRuntimeOp)
type RuntimeOp =
	| ["component", Id, ...Node2[]]
	| ["attach", Item<AttachData>]
	| ["gc", Node2<GarbageCollectionMessage>]
	| [UnknownNode];

interface AttachData {
	type: string;
	snapshot: ITree;
}

// [ ["component"], ["ABCD"], ["ddsOp"], ["1234", { ... }] ] => [ "component", "ABCD", "ddsOp", "1234" ]
export function fullRoute2D(runtimeOp: AnyNode2D[]): string[] {
	return runtimeOp.map(([r]) => r);
}
const op: RuntimeOp2D = [["component"], ["default"], ["ddsOp"], ["dds1", { foo: 123 }]];
fullRoute2D(op);

export function processRuntimeOp(runtimeOp: RuntimeOp2D_explicit): void {
	// Array destructuring would replace unwrapping the envelope
	switch (runtimeOp[0][0]) {
		case "component": {
			// WOMP WOMP - no type narrowing here.
			// I hoped that id would be known to be a string, and inner would be an array of Node
			const idid = runtimeOp[1];
			const [_, id, ...inner] = runtimeOp;
			break;
		}
		case "attach": {
			const [_, item] = runtimeOp;

			break;
		}
		// case { routing: "gc" }: {
		// 	const [{ data }] = runtimeOp;
		// 	break;
		// }
		default: {
			const x = runtimeOp;
			break;
		}
	}
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
export type ContainerRuntimeDocumentSchemaMessage = TypedContainerRuntimeMessage<
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
	| ContainerRuntimeDocumentSchemaMessage
	// Inbound messages may include unknown types from other clients, so we include that as a special case here
	| UnknownContainerRuntimeMessage;

/**
 * A {@link TypedContainerRuntimeMessage} that has been generated by the container runtime, eventually to be sent to the ordering service.
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
