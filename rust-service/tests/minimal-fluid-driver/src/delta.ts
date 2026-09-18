/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEventTransformer } from "@fluidframework/core-interfaces";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import type {
	ConnectionMode,
	IClient,
	IClientConfiguration,
	IDocumentDeltaConnection,
	IDocumentDeltaConnectionEvents,
	IDocumentDeltaStorageService,
	IDocumentMessage,
	ISequencedDocumentMessage,
	ISequencedDocumentSystemMessage,
	ISignalClient,
	ISignalMessage,
	IStream,
	ITokenClaims,
} from "@fluidframework/driver-definitions/internal";

import {
	applicationSequenceOffset,
	bytesEqual,
	decoder,
	defaultSubscriptionBatchMaxOperations,
	defaultSubscriptionBatchMaxPayloadBytes,
	encoder,
	Events,
	projectOperation,
	toSequenced,
	type DeltaConnectionLifecycle,
} from "./lifecycleHelpers.js";
import type {
	ProjectedOperation,
	ProjectedOperationSubscription,
	SeaDriverClient,
	SubmissionResolution,
} from "./wasmClient.js";

/** Finite paged stream used by Fluid delta storage reads. */
class ProjectedMessageStream implements IStream<ISequencedDocumentMessage[]> {
	/** Cursor returned by the latest projected read. */
	private cursor: Uint8Array | undefined;
	/** Whether the service reported its final projected page. */
	private done = false;

	/** Creates a bounded view over projected operations in the requested sequence range. */
	public constructor(
		private readonly client: SeaDriverClient,
		private readonly from: number,
		private readonly to: number | undefined,
		private readonly project: (operation: ProjectedOperation) => ISequencedDocumentMessage,
	) {}

	/** Reads the next filtered projected page, ending after the service's final page. */
	public async read(): Promise<
		{ done: true } | { done: false; value: ISequencedDocumentMessage[] }
	> {
		if (this.done) {
			return { done: true };
		}
		const page = await this.client.readProjected(this.cursor);
		this.cursor = page.cursor;
		this.done = true;
		const messages = page.operations
			.filter(
				({ sequenceNumber }) =>
					Number(sequenceNumber) + applicationSequenceOffset >= this.from &&
					(this.to === undefined ||
						Number(sequenceNumber) + applicationSequenceOffset < this.to),
			)
			.map(this.project);
		return messages.length === 0 && this.done
			? { done: true }
			: { done: false, value: messages };
	}
}

/** Bounded projected-operation history adapter for Fluid delta storage. */
export class SeaDeltaStorage implements IDocumentDeltaStorageService {
	/** Creates delta storage for one document and projection policy. */
	public constructor(
		private readonly client: SeaDriverClient,
		private readonly project: (
			operation: ProjectedOperation,
		) => ISequencedDocumentMessage = toSequenced,
	) {}

	/** Returns a finite stream filtered to Fluid's half-open sequence interval. */
	public fetchMessages(
		from: number,
		to: number | undefined,
	): IStream<ISequencedDocumentMessage[]> {
		return new ProjectedMessageStream(this.client, from, to, this.project);
	}
}

/** Stable identity and payload retained until submission outcome is known. */
interface PendingSubmission {
	/** Service-level submission identity reused for resolution and resubmission. */
	readonly identity: Uint8Array;
	/** Original Fluid message retained for explicit resubmission. */
	readonly message: IDocumentMessage;
}

/** Minimal Fluid delta connection with explicit reconnect and ambiguity recovery. */
export class SeaDeltaConnection extends Events implements IDocumentDeltaConnection {
	/** Registers a Fluid delta-connection event listener. */
	public readonly on = this.addListener as unknown as IEventTransformer<
		this,
		IDocumentDeltaConnectionEvents
	>;
	/** Registers a one-shot Fluid delta-connection event listener. */
	public readonly once = this.onceListener as unknown as IEventTransformer<
		this,
		IDocumentDeltaConnectionEvents
	>;
	/** Removes a Fluid delta-connection event listener. */
	public readonly off = this.removeListener as unknown as IEventTransformer<
		this,
		IDocumentDeltaConnectionEvents
	>;
	/** Synthetic claims sufficient for the isolated Fluid harness. */
	public readonly claims: ITokenClaims;
	/** Indicates that the document already exists when a connection is opened. */
	public readonly existing = true;
	/** Minimal protocol version exposed to Fluid's loader. */
	public readonly version = "^0.1.0";
	/** Synthetic join messages that establish local and remote membership. */
	public readonly initialMessages: ISequencedDocumentMessage[];
	/** Signals are unsupported, so the initial signal list is empty. */
	public readonly initialSignals: ISignalMessage[] = [];
	/** No Routerlicious service configuration is exposed by this adapter. */
	public readonly serviceConfiguration = {} as IClientConfiguration;
	/** Highest projected Fluid sequence number observed by this connection. */
	public checkpointSequenceNumber = 0;
	/** Submissions whose authoritative outcome is not yet known. */
	public readonly pending = new Map<number, PendingSubmission>();
	/** Submitted messages waiting for a contiguous local sequence prefix. */
	private readonly queuedSubmissions = new Map<number, PendingSubmission>();
	/** Next local sequence number eligible for submission. */
	private nextClientSequenceNumber = 1;
	/** Ordered acknowledgement chain observed by waitForIdle. */
	private submitChain: Promise<void> = Promise.resolve();
	/** Current projected-operation subscription. */
	private subscription: ProjectedOperationSubscription | undefined;
	/** Pump consuming the current projected-operation subscription. */
	private subscriptionPump: Promise<void> | undefined;
	/** Whether the Fluid connection has been synchronously disposed. */
	public disposed = false;
	/** Number of projected-operation batches delivered to Fluid. */
	public subscriptionBatchCount = 0;
	/** Largest projected-operation batch delivered to Fluid. */
	public peakSubscriptionBatchOperations = 0;

	/** Creates a connection over document-scoped lifecycle state and one client. */
	public constructor(
		public readonly clientId: string,
		private readonly lifecycle: DeltaConnectionLifecycle,
		private session: Uint8Array,
		private readonly document: Uint8Array,
		private readonly client: SeaDriverClient,
		fluidClient: IClient,
		public readonly mode: ConnectionMode,
		public readonly initialClients: ISignalClient[],
		private readonly onSynchronizationError?: (error: unknown) => void,
		private readonly onSynchronized?: (
			clientId: string,
			messages: readonly ISequencedDocumentMessage[],
		) => void,
		private readonly subscriptionBatchMaxOperations = defaultSubscriptionBatchMaxOperations,
		private readonly subscriptionBatchMaxPayloadBytes = defaultSubscriptionBatchMaxPayloadBytes,
	) {
		super();
		const remoteFluidClient = { ...fluidClient, mode: "write" } satisfies IClient;
		this.initialMessages = [
			{
				sequenceNumber: 1,
				minimumSequenceNumber: 0,
				clientSequenceNumber: 0,
				type: MessageType.ClientJoin,
				clientId: null,
				referenceSequenceNumber: 0,
				contents: "",
				timestamp: 0,
				data: JSON.stringify({
					clientId: lifecycle.clientId,
					detail: remoteFluidClient,
				}),
			} satisfies ISequencedDocumentSystemMessage,
			{
				sequenceNumber: 2,
				minimumSequenceNumber: 0,
				clientSequenceNumber: 0,
				type: MessageType.ClientJoin,
				clientId: null,
				referenceSequenceNumber: 0,
				contents: "",
				timestamp: 0,
				data: JSON.stringify({
					clientId: lifecycle.remoteClientId,
					detail: remoteFluidClient,
				}),
			},
		];
		this.checkpointSequenceNumber = applicationSequenceOffset;
		this.claims = {
			documentId: decoder.decode(document),
			scopes: ["doc:read", "doc:write", "summary:write"],
			tenantId: "minimal-wasm-driver",
			user: { id: clientId },
			iat: 0,
			exp: Number.MAX_SAFE_INTEGER,
			ver: "1.0",
		};
	}

	/** Opens delivery after the consumed cursor, independently of the last submitted event. */
	public async open(sessionOpened = false): Promise<void> {
		if (!sessionOpened) {
			await this.client.openSession(
				this.document,
				this.lifecycle.writer,
				this.session,
				this.lifecycle.cursor,
			);
		}
		await this.openSubscription();
	}

	/** Opens projected delivery from the last consumed cursor. */
	private async openSubscription(): Promise<void> {
		this.subscription = await this.client.subscribeProjected(this.lifecycle.cursor);
		this.subscriptionPump = this.consumeSubscription(this.subscription);
	}

	/** Queues Fluid messages for contiguous ordered submission. */
	public submit(messages: IDocumentMessage[]): void {
		for (const message of messages) {
			const identity = encoder.encode(`${this.clientId}-${message.clientSequenceNumber}`);
			const pending = { identity, message };
			this.pending.set(message.clientSequenceNumber, pending);
			this.queuedSubmissions.set(message.clientSequenceNumber, pending);
		}
		this.scheduleQueuedSubmissions();
	}

	/** Advances the contiguous submission prefix through streaming or unary requests. */
	private scheduleQueuedSubmissions(): void {
		for (;;) {
			const pending = this.queuedSubmissions.get(this.nextClientSequenceNumber);
			if (pending === undefined) {
				return;
			}
			const { identity, message } = pending;
			this.queuedSubmissions.delete(this.nextClientSequenceNumber);
			this.nextClientSequenceNumber++;
			this.submitChain = this.submitChain.then(async () => {
				const position = await this.client.submitEvent(
					identity,
					message.clientSequenceNumber,
					encoder.encode(JSON.stringify(message)),
					this.lifecycle.lastPosition,
				);
				this.lifecycle.lastPosition = position;
				this.pending.delete(message.clientSequenceNumber);
			});
		}
	}

	/** Rejects signal submission because this minimal driver has no signal protocol. */
	public submitSignal(): void {
		throw new Error("signals are unsupported");
	}

	/** Waits for all currently scheduled submissions or their first failure. */
	public async waitForIdle(): Promise<void> {
		await this.submitChain;
	}

	/** Reopens the projected subscription from the last consumed cursor. */
	public async restartSubscription(): Promise<boolean> {
		const resumedFromCursor = this.lifecycle.cursor !== undefined;
		await this.stopSubscription();
		this.session = encoder.encode(`${this.clientId}-session-${Date.now()}-${Math.random()}`);
		await this.client.openSession(
			this.document,
			this.lifecycle.writer,
			this.session,
			this.lifecycle.cursor,
		);
		await this.openSubscription();
		return resumedFromCursor;
	}

	/** Reads and emits projected operations that are not yet consumed by the subscription. */
	public async synchronize(): Promise<ISequencedDocumentMessage[]> {
		const page = await this.client.readProjected(this.lifecycle.cursor);
		this.lifecycle.cursor = page.cursor;
		const messages = page.operations.map((operation) =>
			projectOperation(this.lifecycle, operation),
		);
		if (messages.length > 0) {
			this.checkpointSequenceNumber =
				messages.at(-1)?.sequenceNumber ?? this.checkpointSequenceNumber;
			this.emit("op", decoder.decode(this.document), messages);
		}
		this.onSynchronized?.(this.clientId, messages);
		return messages;
	}

	/** Resolves every pending submission without automatically resubmitting it. */
	public async recoverPending(): Promise<ReadonlyMap<number, SubmissionResolution>> {
		const resolutions = new Map<number, SubmissionResolution>();
		for (const [sequenceNumber, pending] of this.pending) {
			const resolution = await this.client.resolveSubmission(pending.identity);
			resolutions.set(sequenceNumber, resolution);
			if (resolution.kind === "committed") {
				this.lifecycle.lastPosition = resolution.position;
				this.pending.delete(sequenceNumber);
			}
		}
		if (this.pending.size === 0) {
			this.submitChain = Promise.resolve();
		}
		return resolutions;
	}

	/** Explicitly resubmits one authoritatively not-committed pending message. */
	public async resubmitPending(sequenceNumber: number): Promise<void> {
		const pending = this.pending.get(sequenceNumber);
		if (pending === undefined) {
			throw new Error(`no pending submission ${sequenceNumber}`);
		}
		const position = await this.client.submitEvent(
			pending.identity,
			sequenceNumber,
			encoder.encode(JSON.stringify(pending.message)),
			this.lifecycle.lastPosition,
		);
		this.lifecycle.lastPosition = position;
		this.pending.delete(sequenceNumber);
		if (this.pending.size === 0) {
			this.submitChain = Promise.resolve();
		}
	}

	/** Disconnects transport resources while preserving recoverable lifecycle state. */
	public disconnect(): void {
		void this.stopSubscription();
		this.client.disconnect();
		this.emit("disconnect", new Error("explicit disconnect"));
	}

	/** Reconnects the generated client and replaces its streams and subscription. */
	public async reconnect(...args: readonly unknown[]): Promise<void> {
		await this.stopSubscription();
		await this.client.reconnect(...args);
		this.session = encoder.encode(`${this.clientId}-session-${Date.now()}-${Math.random()}`);
		await this.open();
	}

	/** Synchronously marks the Fluid connection disposed and starts resource cleanup. */
	public dispose(error?: Error): void {
		if (!this.disposed) {
			this.disposed = true;
			void this.stopSubscription();
			this.emit(
				"disconnect",
				error ?? Object.assign(new Error("delta connection disposed"), { canRetry: true }),
			);
		}
	}

	/** Pumps projected operations until cancellation, replacement, or failure. */
	private async consumeSubscription(
		subscription: ProjectedOperationSubscription,
	): Promise<void> {
		try {
			while (!this.disposed && this.subscription === subscription) {
				const operations =
					subscription.nextBatch === undefined
						? [await subscription.next()]
						: await subscription.nextBatch(
								this.subscriptionBatchMaxOperations,
								this.subscriptionBatchMaxPayloadBytes,
							);
				if (this.disposed || this.subscription !== subscription) {
					return;
				}
				if (operations.length === 0) {
					throw new Error("projected subscription returned an empty batch");
				}
				const messages = operations.map((operation) => {
					this.lifecycle.cursor = operation.position;
					if (
						bytesEqual(operation.writer, this.lifecycle.writer) &&
						bytesEqual(operation.session, this.session)
					) {
						this.pending.delete(Number(operation.localSequenceNumber));
					}
					return projectOperation(this.lifecycle, operation);
				});
				this.subscriptionBatchCount++;
				this.peakSubscriptionBatchOperations = Math.max(
					this.peakSubscriptionBatchOperations,
					messages.length,
				);
				this.checkpointSequenceNumber = messages.at(-1)?.sequenceNumber ?? 0;
				this.emit("op", decoder.decode(this.document), messages);
				this.onSynchronized?.(this.clientId, messages);
			}
		} catch (error) {
			if (!this.disposed && this.subscription === subscription) {
				this.onSynchronizationError?.(error);
				this.emit("disconnect", error);
			}
		}
	}

	/** Cancels and drains the current projected subscription. */
	private async stopSubscription(): Promise<void> {
		const subscription = this.subscription;
		this.subscription = undefined;
		if (subscription !== undefined) {
			await subscription.cancel();
		}
		await this.subscriptionPump;
		this.subscriptionPump = undefined;
	}
}
