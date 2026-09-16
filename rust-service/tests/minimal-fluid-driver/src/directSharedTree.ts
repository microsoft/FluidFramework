/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createDirectSharedTree,
	ForestTypeOptimized,
	type SharedTreeKernelView,
} from "@fluidframework/tree/internal";
import {
	createIdCompressor,
	type IdCreationRange,
	toIdCompressorWithCore,
} from "@fluidframework/id-compressor/internal";

import { ProtocolClient } from "./protocolClient.js";
import type {
	ProjectedOperation,
	ProjectedOperationSubscription,
	WasmProtocolClient,
} from "./wasmClient.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface DirectSharedTreePayload {
	readonly contents: unknown;
	readonly idCreationRange: IdCreationRange;
}

/** Runtime-free rust-service host for one production SharedTree kernel. */
export class DirectSharedTreeClient {
	/** Production SharedTree API and kernel view owned by this host. */
	public readonly tree: SharedTreeKernelView;
	/** Number of projected batches passed directly to the kernel. */
	public deliveredBatchCount = 0;
	/** Largest projected batch passed directly to the kernel. */
	public peakDeliveredBatchOperations = 0;
	/** Highest canonical service sequence applied to this kernel. */
	public lastAppliedSequenceNumber = 0;

	private readonly protocol: ProtocolClient;
	private readonly writer: Uint8Array;
	private readonly session: Uint8Array;
	private readonly positions = new Map<string, number>();
	private subscription: ProjectedOperationSubscription | undefined;
	private subscriptionPump: Promise<void> | undefined;
	private submissionChain: Promise<void> = Promise.resolve();
	private synchronizationError: unknown;
	private cursor: Uint8Array | undefined;
	private localSequenceNumber = 0;
	private acknowledgedLocalSequenceNumber = 0;
	private disposed = false;

	private constructor(
		private readonly client: WasmProtocolClient,
		private readonly document: Uint8Array,
		private readonly batchMaxOperations: number,
		private readonly batchMaxPayloadBytes: number,
		tree: SharedTreeKernelView,
		writer: Uint8Array,
		session: Uint8Array,
	) {
		this.protocol = new ProtocolClient(client);
		this.tree = tree;
		this.writer = writer;
		this.session = session;
	}

	/** Creates and opens one direct SharedTree client. */
	public static async create(
		client: WasmProtocolClient,
		document: Uint8Array,
		batchMaxOperations: number,
		batchMaxPayloadBytes: number,
		createDocument: boolean,
	): Promise<DirectSharedTreeClient> {
		const idCompressor = createIdCompressor();
		const writer = encoder.encode(idCompressor.localSessionId);
		const session = writer;
		let host: DirectSharedTreeClient | undefined;
		const tree = createDirectSharedTree({
			forest: ForestTypeOptimized,
			idCompressor,
			submitLocalMessage: (contents) => {
				if (host === undefined) {
					throw new Error("direct SharedTree submitted before its host was initialized");
				}
				host.submit(contents, toIdCompressorWithCore(idCompressor).takeNextCreationRange());
			},
		});
		host = new DirectSharedTreeClient(
			client,
			document,
			batchMaxOperations,
			batchMaxPayloadBytes,
			tree,
			writer,
			session,
		);
		if (createDocument) {
			await host.protocol.create(document);
		}
		await host.protocol.openSession(document, writer, session);
		host.subscription = await client.subscribeProjected(document);
		host.subscriptionPump = host.consumeSubscription(host.subscription);
		return host;
	}

	/** Waits until all currently submitted local edits are acknowledged and applied. */
	public async waitForIdle(): Promise<void> {
		await this.submissionChain;
		const deadline = performance.now() + 10_000;
		while (this.acknowledgedLocalSequenceNumber < this.localSequenceNumber) {
			this.throwSynchronizationError();
			if (performance.now() >= deadline) {
				throw new Error(
					`direct SharedTree timed out waiting for acknowledgment ${this.acknowledgedLocalSequenceNumber}/${this.localSequenceNumber}`,
				);
			}
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
		this.throwSynchronizationError();
	}

	/** Stops subscription processing and disconnects the transport. */
	public async dispose(): Promise<void> {
		if (!this.disposed) {
			this.disposed = true;
			await this.subscription?.cancel();
			await this.subscriptionPump;
			this.client.disconnect();
		}
	}

	private submit(contents: unknown, idCreationRange: IdCreationRange): void {
		const localSequenceNumber = ++this.localSequenceNumber;
		const reference = this.cursor?.slice();
		const payload = encoder.encode(
			JSON.stringify({ contents, idCreationRange } satisfies DirectSharedTreePayload),
		);
		const submission = encoder.encode(
			`${decoder.decode(this.session)}-${localSequenceNumber}`,
		);
		this.submissionChain = this.submissionChain.then(async () => {
			await this.protocol.submit(
				this.document,
				this.writer,
				this.session,
				submission,
				localSequenceNumber,
				payload,
				reference,
			);
		});
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
					throw new Error("direct SharedTree subscription returned an empty batch");
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
		const messages = operations.map((operation) => {
			const payload = JSON.parse(decoder.decode(operation.payload)) as DirectSharedTreePayload;
			const sequenceNumber = Number(operation.sequenceNumber);
			this.positions.set(byteKey(operation.position), sequenceNumber);
			if (bytesEqual(operation.session, this.session)) {
				this.acknowledgedLocalSequenceNumber = Number(operation.localSequenceNumber);
			}
			return {
				contents: payload.contents,
				idCreationRange: payload.idCreationRange,
				sequenceNumber,
				referenceSequenceNumber: this.sequenceForReference(operation.reference),
				minimumSequenceNumber: this.sequenceForReference(operation.minimumReference),
				local: bytesEqual(operation.session, this.session),
			};
		});
		this.tree.kernel.processSequencedMessages(messages);
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

	private sequenceForReference(reference: Uint8Array | undefined): number {
		if (reference === undefined) {
			return 0;
		}
		const sequenceNumber = this.positions.get(byteKey(reference));
		if (sequenceNumber === undefined) {
			throw new Error("direct SharedTree operation references an unknown service position");
		}
		return sequenceNumber;
	}

	private throwSynchronizationError(): void {
		if (this.synchronizationError !== undefined) {
			throw this.synchronizationError;
		}
	}
}

function byteKey(value: Uint8Array): string {
	return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
	return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
