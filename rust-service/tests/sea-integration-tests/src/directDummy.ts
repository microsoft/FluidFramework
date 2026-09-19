/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ProjectedOperation,
	ProjectedOperationSubscription,
	SeaDriverClient,
} from "@fluidframework/sea-driver/internal";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface DirectDummyPayload {
	readonly value: number;
}

/** Runtime-free scalar benchmark client hosted directly over rust-service. */
export class DirectDummyClient {
	/** Number of local and remote edits applied by this client. */
	public appliedOpCount = 0;
	/** Current scalar value. */
	public value = 0;
	/** Number of projected batches consumed by this client. */
	public deliveredBatchCount = 0;
	/** Largest projected batch consumed by this client. */
	public peakDeliveredBatchOperations = 0;
	/** Highest canonical service sequence applied by this client. */
	public lastAppliedSequenceNumber = 0;

	private readonly writer: Uint8Array;
	private readonly session: Uint8Array;
	private subscription: ProjectedOperationSubscription | undefined;
	private subscriptionPump: Promise<void> | undefined;
	private submissionChain: Promise<void> = Promise.resolve();
	private synchronizationError: unknown;
	private cursor: Uint8Array | undefined;
	private localSequenceNumber = 0;
	private acknowledgedLocalSequenceNumber = 0;
	private disposed = false;

	private constructor(
		private readonly client: SeaDriverClient,
		private readonly batchMaxOperations: number,
		private readonly batchMaxPayloadBytes: number,
	) {
		this.writer = encoder.encode(crypto.randomUUID());
		this.session = this.writer;
	}

	/** Backend-assigned identity retained for opening peer clients. */
	public documentId: Uint8Array = new Uint8Array();

	/** Creates and opens one direct dummy client. */
	public static async create(
		client: SeaDriverClient,
		document: Uint8Array,
		batchMaxOperations: number,
		batchMaxPayloadBytes: number,
		createDocument: boolean,
	): Promise<DirectDummyClient> {
		const host = new DirectDummyClient(client, batchMaxOperations, batchMaxPayloadBytes);
		host.documentId = createDocument ? await client.create() : document;
		await client.openSession(host.documentId, host.writer, host.session);
		host.subscription = await client.subscribeProjected();
		host.subscriptionPump = host.consumeSubscription(host.subscription);
		return host;
	}

	/** Applies and submits one scalar replacement. */
	public set(value: number): void {
		this.value = value;
		this.appliedOpCount++;
		const localSequenceNumber = ++this.localSequenceNumber;
		const reference = this.cursor?.slice();
		const submission = encoder.encode(
			`${decoder.decode(this.session)}-${localSequenceNumber}`,
		);
		const payload = encoder.encode(JSON.stringify({ value } satisfies DirectDummyPayload));
		this.submissionChain = this.submissionChain.then(async () => {
			await this.client.submitEvent(submission, localSequenceNumber, payload, reference);
		});
	}

	/** Waits until every local edit is submitted, acknowledged, and applied. */
	public async waitForIdle(): Promise<void> {
		await this.submissionChain;
		const deadline = performance.now() + 10_000;
		while (this.acknowledgedLocalSequenceNumber < this.localSequenceNumber) {
			this.throwSynchronizationError();
			if (performance.now() >= deadline) {
				throw new Error(
					`direct dummy timed out waiting for acknowledgment ${this.acknowledgedLocalSequenceNumber}/${this.localSequenceNumber}`,
				);
			}
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
		this.throwSynchronizationError();
	}

	/** Stops projected delivery and disconnects the transport. */
	public async dispose(): Promise<void> {
		if (!this.disposed) {
			this.disposed = true;
			await this.subscription?.cancel();
			await this.subscriptionPump;
			this.client.disconnect();
		}
	}

	private async consumeSubscription(
		subscription: ProjectedOperationSubscription,
	): Promise<void> {
		try {
			while (!this.disposed && this.subscription === subscription) {
				const operations =
					subscription.nextBatch === undefined
						? [await subscription.next()]
						: await subscription.nextBatch(this.batchMaxOperations, this.batchMaxPayloadBytes);
				if (this.disposed || this.subscription !== subscription) {
					return;
				}
				if (operations.length === 0) {
					throw new Error("direct dummy subscription returned an empty batch");
				}
				this.applyOperations(operations);
			}
		} catch (error) {
			if (!this.disposed && this.subscription === subscription) {
				this.synchronizationError = error;
			}
		}
	}

	private applyOperations(operations: readonly ProjectedOperation[]): void {
		for (const operation of operations) {
			if (bytesEqual(operation.session, this.session)) {
				this.acknowledgedLocalSequenceNumber = Number(operation.localSequenceNumber);
			} else {
				const payload = JSON.parse(decoder.decode(operation.payload)) as DirectDummyPayload;
				this.value = payload.value;
				this.appliedOpCount++;
			}
		}
		this.cursor = operations.at(-1)?.position;
		this.lastAppliedSequenceNumber = Number(
			operations.at(-1)?.sequenceNumber ?? this.lastAppliedSequenceNumber,
		);
		this.deliveredBatchCount++;
		this.peakDeliveredBatchOperations = Math.max(
			this.peakDeliveredBatchOperations,
			operations.length,
		);
	}

	private throwSynchronizationError(): void {
		if (this.synchronizationError !== undefined) {
			throw this.synchronizationError;
		}
	}
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
	return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
