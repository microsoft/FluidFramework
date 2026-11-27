/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { normalizeError, UsageError } from "@fluidframework/telemetry-utils/internal";

import type { ContainerRuntime } from "./containerRuntime.js";
import { nativeCheckpointMessageType } from "./messageTypes.js";
import {
	parseNativeCheckpointMessage,
	type NativeCheckpoint,
	type NativeCheckpointMessage,
	type NativeCheckpointRestore,
	type NativeCheckpointRetentionPolicy,
} from "./nativeCheckpoint.js";

/** Options for an explicitly owned checkpoint coordinator. @internal */
export type NativeCheckpointCoordinatorOptions = {
	/** Bounds acknowledgement waits, not cancellation of in-flight storage requests. */
	readonly ackTimeoutMs?: number;
} & (
	| { readonly publishRestores?: false }
	| {
			/** Enable only on a summary-authorized worker, whether requester-owned or elected. */
			readonly publishRestores: true;
			/** Reports failed attempts. Retry explicitly, reconnect, or replace the worker. */
			readonly onPublicationError: (error: unknown, restore: NativeCheckpointRestore) => void;
	  }
);

/**
 * Coordinates acknowledged catalog operations and opt-in restore recovery on one runtime.
 * Hosts own worker creation, capture triggers, retention scheduling, and cache-evicting reload.
 * A timeout is indeterminate: inspect current service state before retrying an operation.
 * @internal
 */
export class NativeCheckpointCoordinator {
	private readonly ackTimeoutMs: number;
	private disposed = false;
	private cancelWait: (() => void) | undefined;
	private publication: Promise<string> | undefined;
	private attemptedRestore: number | undefined;
	private publicationScheduled = false;

	public constructor(
		private readonly runtime: ContainerRuntime,
		private readonly options: NativeCheckpointCoordinatorOptions = {},
	) {
		this.ackTimeoutMs = options.ackTimeoutMs ?? 120_000;
		if (
			!Number.isSafeInteger(this.ackTimeoutMs) ||
			this.ackTimeoutMs <= 0 ||
			this.ackTimeoutMs > 2147483647
		) {
			throw new UsageError("Invalid native checkpoint coordinator timeout");
		}
		runtime.on("op", this.schedulePublication);
		runtime.on("connected", this.onConnected);
		runtime.on("dispose", this.dispose);
		this.schedulePublication();
	}

	/** Captures and returns the acknowledged entry, rejecting a lost catalog race. */
	public async capture(id: string): Promise<NativeCheckpoint> {
		const receipt = await this.submitAndWait(
			async () => this.runtime.createNativeCheckpoint(id),
			(message) => message.action === "store" && message.checkpoint.id === id,
		);
		const checkpoint = this.runtime.getNativeCheckpoints().find((entry) => entry.id === id);
		if (receipt.action !== "store" || checkpoint?.route !== receipt.checkpoint.route) {
			throw new UsageError("Native checkpoint capture lost a restore or retention race");
		}
		return checkpoint;
	}

	/** Applies host-triggered retention and returns the catalog after the local policy op. */
	public async prune(
		policy: NativeCheckpointRetentionPolicy = {},
	): Promise<readonly NativeCheckpoint[]> {
		await this.submitAndWait(
			async () => this.runtime.pruneNativeCheckpoints(policy),
			(message) => message.action === "prune",
		);
		const recovery = this.runtime.getNativeCheckpointRestore();
		if (recovery !== undefined && recovery.phase !== "restored") {
			throw new UsageError("Native checkpoint retention lost a restore race");
		}
		return this.runtime.getNativeCheckpoints();
	}

	/** Orders a restore and rejects if a different request won the sequencing race. */
	public async requestRestore(
		id: string,
		checkpointId: string,
	): Promise<NativeCheckpointRestore> {
		await this.submitAndWait(
			async () => this.runtime.requestNativeCheckpointRestore(id, checkpointId),
			(message) => message.action === "restore",
			{ acceptRemote: true },
		);
		const current = this.runtime.getNativeCheckpointRestore();
		if (current?.restore.id !== id || current.restore.checkpointId !== checkpointId) {
			throw new UsageError("A different native checkpoint restore won the race");
		}
		return current.restore;
	}

	/** Publishes or recovers the ordered restore; concurrent calls share one attempt. */
	public async publishRestore(): Promise<string> {
		this.verifyActive();
		if (this.publication !== undefined) {
			return this.publication;
		}
		const recovery = this.runtime.getNativeCheckpointRestore();
		if (recovery === undefined) {
			throw new UsageError("No native checkpoint restore to publish");
		}
		this.attemptedRestore = recovery.restore.sequenceNumber;
		const publication = this.runtime.publishNativeCheckpointRestore({
			ackTimeoutMs: this.ackTimeoutMs,
		});
		this.publication = publication;
		// Supply both handlers so cleanup does not create an unobserved rejected promise.
		publication.then(
			() => {
				this.publication = undefined;
			},
			() => {
				this.publication = undefined;
			},
		);
		return publication;
	}

	/** Removes listeners and rejects pending catalog waits; does not dispose the host's runtime. */
	public readonly dispose = (): void => {
		this.disposed = true;
		this.runtime.off("op", this.schedulePublication);
		this.runtime.off("connected", this.onConnected);
		this.runtime.off("dispose", this.dispose);
		this.cancelWait?.();
	};

	private readonly onConnected = (): void => {
		this.attemptedRestore = undefined;
		this.schedulePublication();
	};

	private readonly schedulePublication = (): void => {
		if (this.publicationScheduled || this.options.publishRestores !== true) {
			return;
		}
		this.publicationScheduled = true;
		// Runtime op listeners run inside the inbound processing transaction.
		queueMicrotask(() => {
			this.publicationScheduled = false;
			const recovery = this.runtime.getNativeCheckpointRestore();
			if (
				this.disposed ||
				!this.runtime.connected ||
				this.publication !== undefined ||
				recovery === undefined ||
				this.attemptedRestore === recovery.restore.sequenceNumber ||
				this.options.publishRestores !== true
			) {
				return;
			}
			const onError = this.options.onPublicationError;
			this.publishRestore().catch((error: unknown) => onError(error, recovery.restore));
		});
	};

	private verifyActive(): void {
		if (this.disposed || this.runtime.disposed || !this.runtime.connected) {
			throw new UsageError("Native checkpoint coordinator requires a live connected runtime");
		}
	}

	private async submitAndWait(
		submit: () => Promise<unknown>,
		matches: (message: NativeCheckpointMessage) => boolean,
		options: { readonly acceptRemote?: boolean } = {},
	): Promise<NativeCheckpointMessage> {
		this.verifyActive();
		if (this.cancelWait !== undefined) {
			throw new UsageError("Native checkpoint coordinator already has a catalog operation");
		}
		const clientIds = new Set([this.runtime.clientId]);
		const onConnected = (): void => {
			clientIds.add(this.runtime.clientId);
		};
		return new Promise<NativeCheckpointMessage>((resolve, reject) => {
			let settled = false;
			const cleanup = (): void => {
				settled = true;
				clearTimeout(timer);
				this.runtime.off("op", onOp);
				this.runtime.off("connected", onConnected);
				this.cancelWait = undefined;
			};
			const fail = (error: unknown): void => {
				if (settled) {
					return;
				}
				cleanup();
				reject(normalizeError(error));
			};
			const cancel = (): void =>
				fail(new UsageError("Native checkpoint operation interrupted"));
			const onOp = (message: ISequencedDocumentMessage): void => {
				if (
					(options.acceptRemote === true || clientIds.has(message.clientId ?? undefined)) &&
					message.type === nativeCheckpointMessageType
				) {
					const contents = parseNativeCheckpointMessage(message.contents);
					if (matches(contents)) {
						cleanup();
						resolve(contents);
					}
				}
			};
			const timer = setTimeout(
				() =>
					fail(new UsageError("Native checkpoint operation timed out; inspect service state")),
				this.ackTimeoutMs,
			);
			this.cancelWait = cancel;
			this.runtime.on("op", onOp);
			// A read connection can upgrade to a new write client ID on the first submitted op.
			this.runtime.on("connected", onConnected);
			submit().catch(fail);
		});
	}
}
