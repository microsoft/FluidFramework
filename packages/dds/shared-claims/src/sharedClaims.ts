/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import type {
	ISummaryTreeWithStats,
	IRuntimeMessageCollection,
	IRuntimeMessagesContent,
	ISequencedMessageEnvelope,
} from "@fluidframework/runtime-definitions/internal";
import type { IFluidSerializer } from "@fluidframework/shared-object-base/internal";
import {
	SharedObject,
	createSingleBlobSummary,
} from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type {
	ClaimConfirmation,
	ClaimResult,
	ISharedClaims,
	ISharedClaimsEvents,
} from "./interfaces.js";

/**
 * Op format for SharedClaims operations.
 */
interface IClaimOperation {
	type: "claim";
	key: string;
	value: unknown;
}

/**
 * Pending claim entry — stores the submitted value and a resolve function
 * for the deferred promise returned by trySetClaim.
 */
interface IPendingClaim<T> {
	value: T;
	resolve: (result: ClaimConfirmation<T>) => void;
}

const snapshotFileName = "header";

/**
 * {@inheritDoc ISharedClaims}
 * @internal
 */
export class SharedClaims<T = unknown>
	extends SharedObject<ISharedClaimsEvents<T>>
	implements ISharedClaims<T>
{
	/**
	 * Committed claims map — contains only acked, first-writer-wins values.
	 */
	private readonly claims = new Map<string, T>();

	/**
	 * Pending local claims keyed by claim key. Each entry holds the submitted
	 * value and the resolve function for the promise returned to the caller.
	 */
	private readonly pendingClaims = new Map<string, IPendingClaim<T>>();

	/**
	 * Constructs a new SharedClaims instance.
	 *
	 * @param id - Channel ID.
	 * @param runtime - The data store runtime this DDS belongs to.
	 * @param attributes - Channel attributes.
	 */
	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, "fluid_sharedClaims_");
		this.runtime.on("dispose", () => this.abortAllPending());
	}

	/**
	 * {@inheritDoc ISharedClaims.trySetClaim}
	 */
	public trySetClaim(key: string, value: T): ClaimResult<T> {
		// Guard: must be attached and connected.
		if (!this.isAttached()) {
			throw new UsageError(
				"SharedClaims.trySetClaim cannot be called while the container is detached or in staging mode",
			);
		}
		if (!this.runtime.connected) {
			throw new UsageError(
				"SharedClaims.trySetClaim cannot be called while the container is disconnected",
			);
		}

		// If the key is already committed, return immediately.
		const existingValue = this.claims.get(key);
		if (existingValue !== undefined) {
			return { status: "AlreadyClaimed", currentValue: existingValue };
		}

		// If there is already a pending local claim for this key, reject.
		if (this.pendingClaims.has(key)) {
			throw new UsageError(
				`SharedClaims.trySetClaim: a claim for key "${key}" is already pending locally`,
			);
		}

		const op: IClaimOperation = {
			type: "claim",
			key,
			value,
		};

		const promise = new Promise<ClaimConfirmation<T>>((resolve) => {
			this.pendingClaims.set(key, { value, resolve });
		});

		this.submitLocalMessage(op);

		return { status: "Pending", promise };
	}

	/**
	 * {@inheritDoc ISharedClaims.getClaim}
	 */
	public getClaim(key: string): T | undefined {
		return this.claims.get(key);
	}

	// #region SharedObject overrides

	protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		const entries = [...this.claims.entries()];
		return createSingleBlobSummary(
			snapshotFileName,
			serializer.stringify(entries, this.handle),
		);
	}

	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const blob = await storage.readBlob(snapshotFileName);
		const content = new TextDecoder().decode(blob);
		const entries = this.serializer.parse(content) as [string, T][];
		for (const [key, value] of entries) {
			this.claims.set(key, value);
		}
	}

	protected initializeLocalCore(): void {}

	protected onDisconnect(): void {}

	protected override processMessagesCore(messagesCollection: IRuntimeMessageCollection): void {
		const { envelope, local, messagesContent } = messagesCollection;
		for (const messageContent of messagesContent) {
			this.processMessage(envelope, messageContent, local);
		}
	}

	private processMessage(
		messageEnvelope: ISequencedMessageEnvelope,
		messageContent: IRuntimeMessagesContent,
		local: boolean,
	): void {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
		if (messageEnvelope.type === MessageType.Operation) {
			const op = messageContent.contents as IClaimOperation;

			assert(op.type === "claim", "SharedClaims: unexpected op type");

			// First-writer-wins: only the first claim for a key is accepted.
			const isWinner = !this.claims.has(op.key);
			if (isWinner) {
				this.claims.set(op.key, op.value as T);
				this.emit("claimed", op.key, op.value);
			}

			if (local) {
				this.resolvePending(op.key, isWinner);
			}
		}
	}

	/**
	 * Resolves the deferred promise for a pending claim.
	 */
	private resolvePending(key: string, isWinner: boolean): void {
		const pending = this.pendingClaims.get(key);
		assert(pending !== undefined, "Expected a pending claim entry for local ack");
		this.pendingClaims.delete(key);

		if (isWinner) {
			pending.resolve({ status: "Accepted", currentValue: pending.value });
		} else {
			const winnerValue = this.claims.get(key);
			assert(winnerValue !== undefined, "Expected a committed value after losing claim race");
			pending.resolve({ status: "AlreadyClaimed", currentValue: winnerValue });
		}
	}

	/**
	 * Aborts all pending claims (e.g., on dispose).
	 */
	private abortAllPending(): void {
		for (const [, pending] of this.pendingClaims) {
			pending.resolve({ status: "Aborted" });
		}
		this.pendingClaims.clear();
	}

	/**
	 * Override to visit pending claim values for GC in addition to committed claims.
	 * This ensures handles in pending claims are reported as outbound references
	 * and won't be garbage-collected prematurely.
	 */
	protected override processGCDataCore(serializer: IFluidSerializer): void {
		// Visit committed claims (same as summarizeCore).
		this.summarizeCore(serializer);

		// Also visit pending local claim values so their handles are tracked.
		if (this.pendingClaims.size > 0) {
			const pendingValues = [...this.pendingClaims.values()].map((p) => p.value);
			serializer.stringify(pendingValues, this.handle);
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.rollback}
	 */
	protected rollback(content: unknown, _localOpMetadata: unknown): void {
		const op = content as IClaimOperation;
		assert(op.type === "claim", "SharedClaims: unexpected op type in rollback");
		const pending = this.pendingClaims.get(op.key);
		assert(pending !== undefined, "Expected a pending claim entry for rollback");
		this.pendingClaims.delete(op.key);
		pending.resolve({ status: "Aborted" });
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObjectCore.reSubmitCore}
	 */
	protected reSubmitCore(content: unknown, _localOpMetadata: unknown): void {
		this.submitLocalMessage(content);
	}

	protected applyStashedOp(content: unknown): void {
		const op = content as IClaimOperation;
		assert(op.type === "claim", "SharedClaims: only claim ops should be stashed");
		this.submitLocalMessage(op);
	}

	// #endregion
}
