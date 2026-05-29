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

import type { ClaimConfirmation, ClaimResult, IClaims, IClaimsEvents } from "./interfaces.js";

/**
 * Op format for Claims operations.
 */
type IClaimOperation<T> =
	| {
			type: "claim";
			key: string;
			value: T;
			mode: "writeOnce";
	  }
	| {
			type: "claim";
			key: string;
			value: T;
			mode: "cas";
			expectedValue: T;
	  };

/**
 * Pending claim entry — stores the submitted value and a resolve function
 * for the deferred promise returned by trySetClaim/compareAndSetClaim.
 */
interface IPendingClaim<T> {
	value: T;
	resolve: (result: ClaimConfirmation<T>) => void;
}

const snapshotFileName = "header";

/**
 * {@inheritDoc IClaims}
 * @internal
 */
export class Claims<T = unknown> extends SharedObject<IClaimsEvents> implements IClaims<T> {
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
	 * Constructs a new Claims instance.
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
		super(id, runtime, attributes, "fluid_claims_");
		this.runtime.on("dispose", () => this.abortAllPending());
	}

	/**
	 * {@inheritDoc IClaims.trySetClaim}
	 */
	public trySetClaim(key: string, value: T): ClaimResult<T> {
		this.guardConnected();

		// Write-once: reject if key already exists.
		if (this.claims.has(key)) {
			return { status: "AlreadyClaimed", currentValue: this.claims.get(key) };
		}

		return this.submitClaim(key, value, { type: "claim", key, value, mode: "writeOnce" });
	}

	/**
	 * {@inheritDoc IClaims.compareAndSetClaim}
	 */
	public compareAndSetClaim(key: string, value: T, expectedValue: T): ClaimResult<T> {
		this.guardConnected();

		// CAS: reject if key doesn't exist or current value doesn't match expected.
		const currentValue = this.claims.get(key);
		if (!this.claims.has(key) || currentValue !== expectedValue) {
			return { status: "AlreadyClaimed", currentValue };
		}

		return this.submitClaim(key, value, {
			type: "claim",
			key,
			value,
			mode: "cas",
			expectedValue,
		});
	}

	/**
	 * Guards that the container is attached and connected.
	 */
	private guardConnected(): void {
		if (!this.isAttached()) {
			throw new UsageError(
				"Claims cannot be modified while the container is detached or in staging mode",
			);
		}
		if (!this.runtime.connected) {
			throw new UsageError("Claims cannot be modified while the container is disconnected");
		}
	}

	/**
	 * Shared submit logic for both write-once and CAS operations.
	 */
	private submitClaim(key: string, value: T, op: IClaimOperation<T>): ClaimResult<T> {
		// If there is already a pending local claim for this key, reject.
		if (this.pendingClaims.has(key)) {
			throw new UsageError(`Claims: a claim for key "${key}" is already pending locally`);
		}

		const promise = new Promise<ClaimConfirmation<T>>((resolve) => {
			this.pendingClaims.set(key, { value, resolve });
		});

		this.submitLocalMessage(op);

		return { status: "Pending", promise };
	}

	/**
	 * {@inheritDoc IClaims.getClaim}
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
			const op = messageContent.contents as IClaimOperation<T>;

			assert(op.type === "claim", "Claims: unexpected op type");

			const isAccepted =
				op.mode === "cas"
					? this.claims.has(op.key) && this.claims.get(op.key) === op.expectedValue
					: !this.claims.has(op.key);

			if (isAccepted) {
				this.claims.set(op.key, op.value);
				this.emit("claimed", op.key);
			}

			if (local) {
				this.resolvePending(op.key, isAccepted);
			}
		}
	}

	/**
	 * Resolves the deferred promise for a pending claim.
	 *
	 * @remarks
	 * The pending entry may have a no-op resolve for stashed ops re-submitted
	 * during rehydration, or may be absent in unexpected edge cases.
	 */
	private resolvePending(key: string, isWinner: boolean): void {
		const pending = this.pendingClaims.get(key);
		if (pending === undefined) {
			return;
		}
		this.pendingClaims.delete(key);

		if (isWinner) {
			pending.resolve({ status: "Accepted", currentValue: pending.value });
		} else {
			// The current committed value for the key. May be undefined if the key
			// was never claimed (e.g., a CAS op that failed because the key doesn't exist).
			const currentValue = this.claims.get(key);
			pending.resolve({ status: "AlreadyClaimed", currentValue });
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
		// Visit committed claim values so their handles are tracked.
		if (this.claims.size > 0) {
			const committedValues = [...this.claims.values()];
			serializer.stringify(committedValues, this.handle);
		}

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
		const op = content as IClaimOperation<T>;
		assert(op.type === "claim", "Claims: unexpected op type in rollback");
		const pending = this.pendingClaims.get(op.key);
		if (pending === undefined) {
			return;
		}
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
		const op = content as IClaimOperation<T>;
		assert(op.type === "claim", "Claims: only claim ops should be stashed");
		// Track stashed ops as pending so the key is guarded against duplicate
		// trySetClaim/compareAndSetClaim calls and handles are visited by GC.
		// No external caller awaits this promise, so resolve is a no-op.
		this.pendingClaims.set(op.key, { value: op.value, resolve: () => {} });
		this.submitLocalMessage(op);
	}

	// #endregion
}
