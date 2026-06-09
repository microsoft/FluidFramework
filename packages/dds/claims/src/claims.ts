/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type { Listenable } from "@fluidframework/core-interfaces/internal";
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
 *
 * Both write-once and compare-and-swap share the same op shape.
 * `refSeq` is captured from `deltaManager.lastSequenceNumber` at op-creation
 * time when no entry exists for the key (trySetClaim), or from the per-key
 * sequence number that the caller observed when initiating a CAS — the update
 * succeeds only if no newer write has been sequenced for that key since that
 * point.
 */
interface IClaimOperation<T> {
	type: "claim";
	key: string;
	value: T;
	refSeq: number;
}

/**
 * Per-key state — stores the committed value and the sequence number of
 * the op that last set it.
 */
interface IClaimEntry<T> {
	value: T;
	sequenceNumber: number;
}

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
export class Claims<T = unknown> extends SharedObject implements IClaims<T> {
	private readonly _events = createEmitter<IClaimsEvents>();
	public readonly events: Listenable<IClaimsEvents> = this._events;

	/**
	 * Committed claims map — contains only acked values with their sequence numbers.
	 */
	private readonly claims = new Map<string, IClaimEntry<T>>();

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
		// Write-once: reject if key already exists.
		const existing = this.claims.get(key);
		if (existing !== undefined) {
			return { status: "AlreadyClaimed", currentValue: existing.value };
		}

		return this.compareAndSetClaim(key, value);
	}

	/**
	 * {@inheritDoc IClaims.compareAndSetClaim}
	 *
	 * @experimental
	 */
	public compareAndSetClaim(key: string, value: T): ClaimResult<T> {
		const entry = this.claims.get(key);

		// Detached: apply directly, no op needed (no other clients exist).
		if (!this.isAttached()) {
			this.claims.set(key, { value, sequenceNumber: 0 });
			return { status: "Accepted", currentValue: value };
		}

		return this.submitClaim(key, value, {
			type: "claim",
			key,
			value,
			refSeq: entry?.sequenceNumber ?? this.deltaManager.lastSequenceNumber,
		});
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
	 * {@inheritDoc IClaims.get}
	 */
	public get(key: string): T | undefined {
		return this.claims.get(key)?.value;
	}

	/**
	 * {@inheritDoc IClaims.has}
	 */
	public has(key: string): boolean {
		return this.claims.has(key);
	}

	// #region SharedObject overrides

	protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		const entries = [...this.claims.entries()].map(([key, entry]) => ({
			k: key,
			v: entry.value,
			s: entry.sequenceNumber,
		}));
		return createSingleBlobSummary(
			snapshotFileName,
			serializer.stringify(entries, this.handle),
		);
	}

	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const blob = await storage.readBlob(snapshotFileName);
		const content = new TextDecoder().decode(blob);
		const entries = this.serializer.parse(content) as { k: string; v: T; s: number }[];
		for (const { k, v, s } of entries) {
			this.claims.set(k, { value: v, sequenceNumber: s });
		}
	}

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

			const entry = this.claims.get(op.key);
			// Accept if the key is unclaimed (trySetClaim) or if the caller's
			// snapshot matches the current per-key sequence number (CAS).
			const isAccepted = entry === undefined || op.refSeq === entry.sequenceNumber;

			if (isAccepted) {
				this.claims.set(op.key, {
					value: op.value,
					sequenceNumber: messageEnvelope.sequenceNumber,
				});
				this._events.emit("claimed", op.key);
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
			// was never claimed (e.g., a trySetClaim op that lost the race).
			const currentValue = this.claims.get(key)?.value;
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
			const committedValues = [...this.claims.values()].map((entry) => entry.value);
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
