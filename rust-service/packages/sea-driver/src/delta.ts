/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEventTransformer } from "@fluidframework/core-interfaces";
import type {
	SeaSignals,
	SeaSignalEvent,
	SeaSignalMember,
} from "@fluidframework/sea-typescript/internal";
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
	sessionClientId,
	toSequenced,
	type DeltaConnectionLifecycle,
	type Listener,
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
				(operation) =>
					Number(operation.sequenceNumber) +
						(operation.eventType === undefined ? applicationSequenceOffset : 0) >=
						this.from &&
					(this.to === undefined ||
						Number(operation.sequenceNumber) +
							(operation.eventType === undefined ? applicationSequenceOffset : 0) <
							this.to),
			)
			.map(this.project);
		return messages.length === 0 && this.done
			? { done: true }
			: { done: false, value: messages };
	}
}

/**
 * Bounded projected-operation history adapter for Fluid delta storage.
 * @internal
 */
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

/**
 * Session and message retained until submission outcome is known.
 * @internal
 */
export interface PendingSubmission {
	/** Original session whose terminal prefix determines acceptance. */
	readonly session: Uint8Array;
	/** Original Fluid message supplied to the application's suffix transformation. */
	readonly message: IDocumentMessage;
}

/**
 * Minimal Fluid delta connection with explicit reconnect and ambiguity recovery.
 * @internal
 */
export class SeaDeltaConnection extends Events implements IDocumentDeltaConnection {
	/** Registers a Fluid delta-connection event listener. */
	public readonly on = ((event: string, listener: Listener) => {
		if (event === "signal") this.signalListenerAttached = true;
		const result = this.addListener(event, listener);
		if (event === "pong") {
			this.pongListenerAttached = true;
			this.startLatencyTracking();
		}
		return result;
	}) as unknown as IEventTransformer<this, IDocumentDeltaConnectionEvents>;
	/** Registers a one-shot Fluid delta-connection event listener. */
	public readonly once = ((event: string, listener: Listener) => {
		if (event === "signal") this.signalListenerAttached = true;
		const result = this.onceListener(event, listener);
		if (event === "pong") {
			this.pongListenerAttached = true;
			this.startLatencyTracking();
		}
		return result;
	}) as unknown as IEventTransformer<this, IDocumentDeltaConnectionEvents>;
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
	/** Initial audience is supplied through initialClients; no application signals are retained. */
	public readonly initialSignals: ISignalMessage[] = [];
	/** No Routerlicious service configuration is exposed by this adapter. */
	public readonly serviceConfiguration = {} as IClientConfiguration;
	/** Highest projected Fluid sequence number observed by this connection. */
	public checkpointSequenceNumber = 0;
	/** Submissions whose authoritative outcome is not yet known. */
	public readonly pending = new Map<number, PendingSubmission>();
	/** Submitted messages waiting for a contiguous local sequence prefix. */
	private readonly queuedSubmissions = new Map<number, PendingSubmission>();
	/** Full ordered attempt ledger, including acknowledged events needed for prefix proof. */
	private readonly submitted: {
		readonly session: Uint8Array;
		readonly sequenceNumber: number;
	}[] = [];
	/** Exact pending suffix proven against terminal history in the current fresh session. */
	private recoveredPending: ReadonlyMap<number, PendingSubmission> | undefined;
	/** Next local sequence number eligible for submission. */
	private nextClientSequenceNumber = 1;
	/** Ordered acknowledgement chain observed by waitForIdle. */
	private submitChain: Promise<void> = Promise.resolve();
	/** Current projected-operation subscription. */
	private subscription: ProjectedOperationSubscription | undefined;
	/** Pump consuming the current projected-operation subscription. */
	private subscriptionPump: Promise<void> | undefined;
	/** Live relay registration, separate from ordered writer membership. */
	private signals: SeaSignals | undefined;
	/** Completion of the current signal receive loop. */
	private signalPump: Promise<void> | undefined;
	/** Keeps setup-time signals in the loader's initial batch until its first listener. */
	private signalListenerAttached = false;
	/** Enables read-only round-trip measurements after a pong listener attaches. */
	private pongListenerAttached = false;
	/** Identity suppressing late measurements from disconnected or replaced streams. */
	private latencyTracking: object | undefined;
	/** Next latency measurement; no overlapping requests are scheduled. */
	private latencyTimer: ReturnType<typeof setTimeout> | undefined;
	/** Reopened connections deliver catch-up through listeners instead of a second initial batch. */
	private opened = false;
	/** Whether the Fluid connection has been synchronously disposed. */
	public disposed = false;
	/** Number of projected-operation batches delivered to Fluid. */
	public subscriptionBatchCount = 0;
	/** Largest projected-operation batch delivered to Fluid. */
	public peakSubscriptionBatchOperations = 0;

	/** Creates a connection over document-scoped lifecycle state and one client. */
	public constructor(
		public clientId: string,
		private readonly lifecycle: DeltaConnectionLifecycle,
		private session: Uint8Array,
		private readonly document: Uint8Array,
		private readonly client: SeaDriverClient,
		private readonly fluidClient: IClient,
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
		this.initialMessages =
			this.client.announceMembership === undefined
				? [
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
					]
				: [];
		this.checkpointSequenceNumber =
			this.client.applicationSequenceOffset ?? applicationSequenceOffset;
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
			await this.client.openSession(this.document, this.session, this.lifecycle.cursor);
		}
		if (this.client.announceMembership !== undefined) {
			const allocated = this.client.sessionId;
			if (allocated !== undefined) {
				this.session = allocated;
				this.clientId = sessionClientId(allocated);
				this.claims.user.id = this.clientId;
			}
			await this.client.announceMembership(encoder.encode(JSON.stringify(this.fluidClient)));
			const page = await this.client.readProjected(
				this.opened ? this.lifecycle.cursor : undefined,
			);
			const messages = page.operations.map((operation) =>
				projectOperation(this.lifecycle, operation),
			);
			if (this.opened) {
				if (messages.length > 0) this.emit("op", decoder.decode(this.document), messages);
				this.onSynchronized?.(this.clientId, messages);
			} else {
				this.initialMessages.splice(0, this.initialMessages.length, ...messages);
			}
			this.projectAudience(page.operations, !this.opened);
			this.lifecycle.cursor = page.cursor;
			this.checkpointSequenceNumber =
				messages.at(-1)?.sequenceNumber ?? this.checkpointSequenceNumber;
		}
		await this.openSignals();
		this.opened = true;
		await this.openSubscription();
		this.startLatencyTracking();
	}

	/** Starts one measurement loop for the current live delta stream. */
	private startLatencyTracking(): void {
		if (
			!this.pongListenerAttached ||
			this.disposed ||
			this.subscription === undefined ||
			this.latencyTracking !== undefined
		)
			return;
		const tracking = {};
		this.latencyTracking = tracking;
		void this.measureLatency(tracking);
	}

	/** Measures successful metadata round trips; stream liveness, not probe failure, owns disconnection. */
	private async measureLatency(tracking: object): Promise<void> {
		const start = performance.now();
		try {
			await this.client.latestSnapshot();
			if (this.latencyTracking === tracking) this.emit("pong", performance.now() - start);
		} catch {
		} finally {
			if (this.latencyTracking === tracking) {
				this.latencyTimer = setTimeout(() => void this.measureLatency(tracking), 60_000);
			}
		}
	}

	/** Allocates a new membership identity while retaining the old session's pending messages. */
	private renewSession(): void {
		this.recoveredPending = undefined;
		if (this.client.announceMembership === undefined) {
			this.session = encoder.encode(`${this.clientId}-session-${Date.now()}-${Math.random()}`);
		} else {
			this.clientId = `client-${crypto.randomUUID()}`;
			this.session = encoder.encode(this.clientId);
		}
	}

	/** Opens projected delivery from the last consumed cursor. */
	private async openSubscription(): Promise<void> {
		this.subscription = await this.client.subscribeProjected(this.lifecycle.cursor);
		this.subscriptionPump = this.consumeSubscription(this.subscription);
	}

	/** Queues Fluid messages for contiguous ordered submission. */
	public submit(messages: IDocumentMessage[]): void {
		this.recoveredPending = undefined;
		for (const message of messages) {
			const pending = { message, session: this.session };
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
			const { message } = pending;
			this.queuedSubmissions.delete(this.nextClientSequenceNumber);
			this.nextClientSequenceNumber++;
			this.submitted.push({
				session: pending.session,
				sequenceNumber: message.clientSequenceNumber,
			});
			this.submitChain = this.submitChain.then(async () => {
				const position = await this.client.submitEvent(
					encoder.encode(JSON.stringify(message)),
					this.client.applicationSequenceOffset === 0
						? this.client.positionForSequence(message.referenceSequenceNumber)
						: this.lifecycle.lastPosition,
				);
				this.lifecycle.lastPosition = position;
				this.pending.delete(message.clientSequenceNumber);
			});
		}
	}

	/** Uses reliable live delivery for Fluid, including self echo and optional targeting. */
	public submitSignal(content: string, targetClientId?: string): void {
		const signals = this.signals;
		if (this.disposed || signals === undefined)
			throw new Error("signal connection is not open");
		void signals
			.send(
				encoder.encode(content),
				targetClientId === undefined ? undefined : { target: encoder.encode(targetClientId) },
			)
			.catch((error: unknown) => {
				if (!this.disposed && this.signals === signals)
					this.dispose(error instanceof Error ? error : new Error(String(error)));
			});
	}

	/** Loads a current membership snapshot before exposing subsequent live notifications. */
	private async openSignals(): Promise<void> {
		if (this.client.openSignals === undefined) return;
		const signals = await this.client.openSignals({
			id: encoder.encode(this.clientId),
			metadata: encoder.encode(JSON.stringify(this.fluidClient)),
		});
		this.signals = signals;
		const snapshot = await signals.next();
		if (snapshot?.kind !== "members")
			throw new Error("signal registration did not provide a membership snapshot");
		const members = snapshot.members.map((member) => this.signalMember(member));
		if (this.opened) {
			this.emitSignal({ clientId: null, content: JSON.stringify({ type: "clear" }) });
			for (const member of members) this.emitMembership(MessageType.ClientJoin, member);
		} else {
			this.initialClients.splice(0, this.initialClients.length, ...members);
		}
		this.signalPump = this.consumeSignals(signals);
	}

	/** Decodes Fluid metadata only at the driver boundary. */
	private signalMember(member: SeaSignalMember): ISignalClient {
		return {
			clientId: decoder.decode(member.id),
			client: JSON.parse(decoder.decode(member.metadata)) as IClient,
		};
	}

	/** Encodes loader system signals; writer audience remains governed by quorum. */
	private emitMembership(type: string, content: ISignalClient | string): void {
		this.emitSignal({ clientId: null, content: JSON.stringify({ type, content }) });
	}

	/** Preserves setup-time messages with the same bounded failure policy as live delivery. */
	private emitSignal(signal: ISignalMessage): void {
		if (this.signalListenerAttached) this.emit("signal", signal);
		else {
			if (this.initialSignals.length >= 256)
				throw new Error("initial signal queue overflowed");
			this.initialSignals.push(signal);
		}
	}

	/** Pumps independent relay traffic and rejects stale observations after replacement. */
	private async consumeSignals(signals: SeaSignals): Promise<void> {
		try {
			while (!this.disposed && this.signals === signals) {
				const event: SeaSignalEvent | undefined = await signals.next();
				if (this.disposed || this.signals !== signals) return;
				if (event === undefined) throw new Error("signal connection ended");
				switch (event.kind) {
					case "joined":
						this.emitMembership(MessageType.ClientJoin, this.signalMember(event.member));
						break;
					case "left":
						this.emitMembership(MessageType.ClientLeave, decoder.decode(event.id));
						break;
					case "message":
						this.emitSignal({
							clientId: decoder.decode(event.sender),
							content: decoder.decode(event.payload),
							...(event.target === undefined
								? {}
								: { targetClientId: decoder.decode(event.target) }),
						} satisfies ISignalMessage);
						break;
					case "members":
						throw new Error("unexpected replacement signal snapshot");
				}
			}
		} catch (error) {
			if (!this.disposed && this.signals === signals)
				this.dispose(error instanceof Error ? error : new Error(String(error)));
		}
	}

	/** Waits for all currently scheduled submissions or their first failure. */
	public async waitForIdle(): Promise<void> {
		await this.submitChain;
	}

	/** Reopens delivery from the consumed cursor without changing membership or signals. */
	public async restartSubscription(): Promise<boolean> {
		const resumedFromCursor = this.lifecycle.cursor !== undefined;
		await this.stopProjectedSubscription();
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
		this.projectAudience(page.operations);
		return messages;
	}

	/** Rebuilds the initial audience or emits read-only membership signals from durable records.
	 * Writer audience membership remains controlled by the sequenced quorum operations.
	 */
	private projectAudience(operations: readonly ProjectedOperation[], initial = false): void {
		if (this.client.openSignals !== undefined) return;
		const members = new Map<string, ISignalClient>();
		for (const operation of operations) {
			if (operation.eventType !== "joined" && operation.eventType !== "left") continue;
			const clientId = sessionClientId(operation.session);
			const joined = operation.eventType === "joined";
			const member = joined
				? { clientId, client: JSON.parse(decoder.decode(operation.payload)) as IClient }
				: undefined;
			if (initial) {
				if (member === undefined) members.delete(clientId);
				else members.set(clientId, member);
			} else if (operation.membershipMode === "read") {
				this.emit("signal", {
					clientId: null,
					content: JSON.stringify({
						type: joined ? MessageType.ClientJoin : MessageType.ClientLeave,
						content: member ?? clientId,
					}),
				} satisfies ISignalMessage);
			}
		}
		if (initial)
			this.initialClients.splice(0, this.initialClients.length, ...members.values());
	}

	/** Proves the old accepted prefix through its leave before exposing an unaccepted suffix.
	 * Call after reconnect and before submitting new work; resolution alone never authorizes replay.
	 */
	public async recoverPending(): Promise<ReadonlyMap<number, SubmissionResolution>> {
		await this.submitChain.catch(() => {});
		this.recoveredPending = undefined;
		const resolutions = new Map<number, SubmissionResolution>();
		if (this.pending.size === 0) return resolutions;
		if (this.client.announceMembership === undefined) {
			throw new Error("terminal-prefix recovery requires authoritative membership");
		}
		const page = await this.client.readProjected();
		for (const [sequenceNumber, pending] of this.pending) {
			if (bytesEqual(pending.session, this.session)) {
				throw new Error("recovery requires a fresh session after the old append stream ends");
			}
			const history = page.operations.filter((operation) =>
				bytesEqual(operation.session, pending.session),
			);
			if (history[0]?.eventType !== "joined" || history.at(-1)?.eventType !== "left") {
				throw new Error("old session has no terminal leave in retained history");
			}
			const accepted = history.filter((operation) => operation.eventType === "application");
			const attempted = this.submitted.filter((attempt) =>
				bytesEqual(attempt.session, pending.session),
			);
			if (
				accepted.length > attempted.length ||
				accepted.some(
					(operation, index) =>
						operation.localSequenceNumber !== BigInt(attempted[index]?.sequenceNumber ?? -1),
				)
			) {
				throw new Error("retained application events are not the submitted prefix");
			}
			const ordinal = attempted.findIndex(
				(attempt) => attempt.sequenceNumber === pending.message.clientSequenceNumber,
			);
			const committed = ordinal < 0 ? undefined : accepted[ordinal];
			const resolution: SubmissionResolution =
				committed === undefined
					? { kind: "notCommitted" }
					: {
							kind: "committed",
							position: committed.position,
							sequenceNumber: committed.sequenceNumber,
						};
			resolutions.set(sequenceNumber, resolution);
		}
		for (const [sequenceNumber, resolution] of resolutions) {
			if (resolution.kind === "committed") {
				this.lifecycle.lastPosition = resolution.position;
				this.pending.delete(sequenceNumber);
			}
		}
		if (this.pending.size === 0) {
			this.submitChain = Promise.resolve();
		}
		this.recoveredPending = new Map(this.pending);
		return resolutions;
	}

	/** Delegates transformation of the entire proven suffix to the application.
	 * The callback must reconcile accepted history and return fresh-session messages numbered from one,
	 * with payloads and reference sequence numbers appropriate to their new context. SEA never rebases them.
	 */
	public async resubmitPending(
		transform: (suffix: readonly PendingSubmission[]) => readonly IDocumentMessage[],
	): Promise<void> {
		const recovered = this.recoveredPending;
		if (
			recovered === undefined ||
			recovered.size !== this.pending.size ||
			[...recovered].some(([sequence, pending]) => this.pending.get(sequence) !== pending) ||
			this.submitted.some((pending) => bytesEqual(pending.session, this.session))
		) {
			throw new Error("resubmission requires a proven suffix and an unused fresh session");
		}
		const suffix = [...recovered.values()].sort(
			(first, second) =>
				first.message.clientSequenceNumber - second.message.clientSequenceNumber,
		);
		const transformed = [...transform(suffix)];
		if (transformed.some((message, index) => message.clientSequenceNumber !== index + 1)) {
			throw new Error("transformed suffix must use contiguous fresh-session sequence numbers");
		}
		this.pending.clear();
		this.queuedSubmissions.clear();
		this.submitChain = Promise.resolve();
		this.nextClientSequenceNumber = 1;
		this.submit(transformed);
		await this.waitForIdle();
	}

	/** Disconnects transport resources while preserving recoverable lifecycle state. */
	public disconnect(): void {
		void this.stopSubscription();
		this.client.disconnect(this.session);
		this.emit("disconnect", new Error("explicit disconnect"));
	}

	/** Reconnects the generated client and replaces its streams and subscription. */
	public async reconnect(...args: readonly unknown[]): Promise<void> {
		await this.stopSubscription();
		await this.client.reconnect(...args);
		this.renewSession();
		await this.open();
	}

	/** Synchronously marks the Fluid connection disposed and starts resource cleanup. */
	public dispose(error?: Error): void {
		if (!this.disposed) {
			this.disposed = true;
			void this.stopSubscription();
			this.client.disconnect(this.session);
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
					if (bytesEqual(operation.session, this.session)) {
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
				this.projectAudience(operations);
				this.onSynchronized?.(this.clientId, messages);
			}
		} catch (error) {
			if (!this.disposed && this.subscription === subscription) {
				this.onSynchronizationError?.(error);
				this.emit("disconnect", error);
			}
		}
	}

	/** Stops latency tracking and drains the signal registration and projected subscription. */
	private async stopSubscription(): Promise<void> {
		this.latencyTracking = undefined;
		clearTimeout(this.latencyTimer);
		this.latencyTimer = undefined;
		const signals = this.signals;
		const signalPump = this.signalPump;
		this.signals = undefined;
		this.signalPump = undefined;
		if (signals !== undefined) await signals.close();
		await signalPump;
		await this.stopProjectedSubscription();
	}

	/** Cancels and drains only the event reader, preserving session and relay ownership. */
	private async stopProjectedSubscription(): Promise<void> {
		const subscription = this.subscription;
		this.subscription = undefined;
		if (subscription !== undefined) {
			await subscription.cancel();
		}
		await this.subscriptionPump;
		this.subscriptionPump = undefined;
	}
}
