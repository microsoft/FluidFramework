/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IDisposable,
	IErrorBase,
	IErrorEvent,
	IEvent,
	IEventProvider,
} from "@fluidframework/core-interfaces";
import type { IClientDetails } from "@fluidframework/driver-definitions";
import type {
	IAnyDriverError,
	IClientConfiguration,
	IDocumentMessage,
	ITokenClaims,
	ISequencedDocumentMessage,
	ISignalMessage,
} from "@fluidframework/driver-definitions/internal";

/**
 * Contract representing the result of a newly established connection to the server for syncing deltas.
 * @legacy
 * @alpha
 */
export interface IConnectionDetails {
	/**
	 * The client's unique identifier assigned by the service.
	 *
	 * @remarks It is not stable across reconnections.
	 */
	clientId: string;

	claims: ITokenClaims;
	serviceConfiguration: IClientConfiguration;

	/**
	 * Last known sequence number to ordering service at the time of connection.
	 *
	 * @remarks
	 *
	 * It may lag behind the actual last sequence number (quite a bit, if the container is very active),
	 * but it's the best information the client has to figure out how far behind it is, at least
	 * for "read" connections. "write" connections may use the client's own "join" op to obtain similar
	 * information which is likely to be more up-to-date.
	 */
	checkpointSequenceNumber: number | undefined;
}

/**
 * Contract supporting delivery of outbound messages to the server
 * @sealed
 * @legacy
 * @alpha
 */
export interface IDeltaSender {
	/**
	 * Flush all pending messages through the outbound queue
	 */
	flush(): void;
}

/**
 * Events emitted by {@link IDeltaManager}.
 * @sealed
 * @legacy
 * @alpha
 */
export interface IDeltaManagerEvents extends IEvent {
	/**
	 * @deprecated No replacement API recommended.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(event: "prepareSend", listener: (messageBuffer: any[]) => void);

	/**
	 * @deprecated No replacement API recommended.
	 */
	(event: "submitOp", listener: (message: IDocumentMessage) => void);

	/**
	 * Emitted immediately after processing an incoming operation (op).
	 *
	 * @remarks
	 *
	 * Note: this event is not intended for general use.
	 * Prefer to listen to events on the appropriate ultimate recipients of the ops, rather than listening to the
	 * ops directly on the {@link IDeltaManager}.
	 *
	 * Listener parameters:
	 *
	 * - `message`: The op that was processed.
	 *
	 * - `processingTime`: The amount of time it took to process the inbound operation (op), expressed in milliseconds.
	 */
	(
		event: "op",
		listener: (message: ISequencedDocumentMessage, processingTime: number) => void,
	);

	/**
	 * Emitted periodically with latest information on network roundtrip latency
	 */
	(event: "pong", listener: (latency: number) => void);

	/**
	 * Emitted when the {@link IDeltaManager} completes connecting to the Fluid service.
	 *
	 * @remarks
	 * This occurs once we've received the connect_document_success message from the server,
	 * and happens prior to the client's join message (if there is a join message).
	 *
	 * Listener parameters:
	 *
	 * - `details`: Connection metadata.
	 *
	 * - `opsBehind`: An estimate of far behind the client is relative to the service in terms of ops.
	 * Will not be specified if an estimate cannot be determined.
	 */
	(event: "connect", listener: (details: IConnectionDetails, opsBehind?: number) => void);

	/**
	 * Emitted when the {@link IDeltaManager} becomes disconnected from the Fluid service.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `reason`: Describes the reason for which the delta manager was disconnected.
	 * - `error` : error if any for the disconnect.
	 */
	(event: "disconnect", listener: (reason: string, error?: IAnyDriverError) => void);

	/**
	 * Emitted when read/write permissions change.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `readonly`: Whether or not the delta manager is now read-only.
	 */
	(
		event: "readonly",
		listener: (
			readonly: boolean,
			readonlyConnectionReason?: { reason: string; error?: IErrorBase },
		) => void,
	);
}

/**
 * Manages the transmission of ops between the runtime and storage.
 * @sealed
 * @legacy
 * @alpha
 */
export interface IDeltaManager<T, U>
	extends IEventProvider<IDeltaManagerEvents>,
		IDeltaSender {
	/**
	 * The queue of inbound delta signals
	 */
	readonly inboundSignal: IDeltaQueue<ISignalMessage>;

	/**
	 * The current minimum sequence number
	 */
	readonly minimumSequenceNumber: number;

	/**
	 * The last sequence number processed by the delta manager
	 */
	readonly lastSequenceNumber: number;

	/**
	 * The last message processed by the delta manager
	 */
	readonly lastMessage: ISequencedDocumentMessage | undefined;

	/**
	 * The latest sequence number the delta manager is aware of
	 */
	readonly lastKnownSeqNumber: number;

	/**
	 * The initial sequence number set when attaching the op handler
	 */
	readonly initialSequenceNumber: number;

	/**
	 * Tells if current connection has checkpoint information.
	 * I.e. we know how far behind the client was at the time of establishing connection
	 */
	readonly hasCheckpointSequenceNumber: boolean;

	/**
	 * Details of client
	 */
	readonly clientDetails: IClientDetails;

	/**
	 * Protocol version being used to communicate with the service
	 */
	readonly version: string;

	/**
	 * Max message size allowed to the delta manager
	 */
	readonly maxMessageSize: number;

	/**
	 * Service configuration provided by the service.
	 */
	readonly serviceConfiguration: IClientConfiguration | undefined;

	/**
	 * Flag to indicate whether the client can write or not.
	 */
	readonly active: boolean;

	readonly readOnlyInfo: ReadOnlyInfo;

	/**
	 * Submit a signal to the service to be broadcast to other connected clients, but not persisted
	 */
	// TODO: use `unknown` instead (API breaking)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	submitSignal(content: any, targetClientId?: string): void;
}

/**
 * DeltaManager which is used internally by the Fluid layers and not exposed to the end users.
 * @internal
 */
export interface IDeltaManagerFull<T = ISequencedDocumentMessage, U = IDocumentMessage>
	extends IDeltaManager<T, U> {
	/**
	 * The queue of inbound delta messages
	 */
	readonly inbound: IDeltaQueue<T>;

	/**
	 * The queue of outbound delta messages
	 */
	readonly outbound: IDeltaQueue<U[]>;
}

/**
 * Type guard to check if the given deltaManager is of type {@link @fluidframework/container-definitions#IDeltaManagerFull}.
 * @internal
 */
export function isIDeltaManagerFull(
	deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
): deltaManager is IDeltaManagerFull {
	return "inbound" in deltaManager && "outbound" in deltaManager;
}

/**
 * Events emitted by {@link IDeltaQueue}.
 * @sealed
 * @legacy
 * @alpha
 */
export interface IDeltaQueueEvents<T> extends IErrorEvent {
	/**
	 * Emitted when a task is enqueued.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `task`: The task being enqueued.
	 */
	(event: "push", listener: (task: T) => void);

	/**
	 * Emitted immediately after processing an enqueued task and removing it from the queue.
	 *
	 * @remarks
	 *
	 * Note: this event is not intended for general use.
	 * Prefer to listen to events on the appropriate ultimate recipients of the ops, rather than listening to the
	 * ops directly on the {@link IDeltaQueue}.
	 *
	 * Listener parameters:
	 *
	 * - `task`: The task that was processed.
	 */
	(event: "op", listener: (task: T) => void);

	/**
	 * Emitted when the queue of tasks to process is emptied.
	 *
	 * @remarks Listener parameters:
	 *
	 * - `count`: The number of events (`T`) processed before becoming idle.
	 *
	 * - `duration`: The amount of time it took to process elements (in milliseconds).
	 *
	 * @see {@link IDeltaQueue.idle}
	 */
	(event: "idle", listener: (count: number, duration: number) => void);
}

/**
 * Queue of ops to be sent to or processed from storage
 * @sealed
 * @legacy
 * @alpha
 */
export interface IDeltaQueue<T> extends IEventProvider<IDeltaQueueEvents<T>>, IDisposable {
	/**
	 * Flag indicating whether or not the queue was paused
	 */
	paused: boolean;

	/**
	 * The number of messages remaining in the queue
	 */
	length: number;

	/**
	 * Flag indicating whether or not the queue is idle.
	 * I.e. there are no remaining messages to processes.
	 */
	idle: boolean;

	/**
	 * Pauses processing on the queue.
	 *
	 * @returns A promise which resolves when processing has been paused.
	 */
	pause(): Promise<void>;

	/**
	 * Resumes processing on the queue
	 */
	resume(): void;

	/**
	 * Peeks at the next message in the queue
	 */
	peek(): T | undefined;

	/**
	 * Returns all the items in the queue as an array. Does not remove them from the queue.
	 */
	toArray(): T[];

	/**
	 * returns number of ops processed and time it took to process these ops.
	 * Zeros if queue did not process anything (had no messages, was paused or had hit an error before)
	 */
	waitTillProcessingDone(): Promise<{ count: number; duration: number }>;
}

/**
 * @legacy
 * @alpha
 */
export type ReadOnlyInfo =
	| {
			readonly readonly: false | undefined;
	  }
	| {
			readonly readonly: true;

			/**
			 * Read-only because `forceReadOnly()` was called.
			 */
			readonly forced: boolean;

			/**
			 * Read-only because client does not have write permissions for document.
			 */
			readonly permissions: boolean | undefined;

			/**
			 * Read-only with no delta stream connection.
			 */
			readonly storageOnly: boolean;

			/**
			 * Extra info on why connection to delta stream is not possible.
			 *
			 * @remarks This info might be provided if {@link ReadOnlyInfo.storageOnly} is set to `true`.
			 */
			readonly storageOnlyReason?: string;
	  };
