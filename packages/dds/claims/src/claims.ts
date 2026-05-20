/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/core-utils/internal";
import type {
	IChannelAttributes,
	IChannelStorageService,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import type {
	IRuntimeMessageCollection,
	ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions/internal";
import type { IFluidSerializer } from "@fluidframework/shared-object-base/internal";
import {
	SharedObject,
	createSingleBlobSummary,
} from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type {
	ClaimResult,
	IClaimAttempt,
	ISharedClaims,
	ISharedClaimsEvents,
} from "./interfaces.js";

/**
 * Wire format for a sequenced claim op.
 *
 * The op is intentionally minimal: a claim is a single first-writer-wins
 * `set` of `key` → `value`. There is no `delete` (claims are immutable
 * for the lifetime of the document) and no `update`.
 *
 * The `value` carries handles in their decoded form on the in-process
 * pipeline; the SharedObject base class is responsible for encoding /
 * decoding handles as the op travels through the outbox / inbox.
 */
interface IClaimSetOp {
	readonly type: "set";
	readonly key: string;
	readonly value: unknown;
}

/**
 * Persisted format of the claims summary blob. Only sequenced entries are
 * written; the local winner-vs-loser distinction is per-client state and
 * is intentionally not persisted (the loading client cannot have been the
 * writer).
 */
interface IClaimsSummaryFormat {
	readonly entries: readonly (readonly [string, unknown])[];
}

const snapshotFileName = "header";

/**
 * {@inheritDoc ISharedClaims}
 * @internal
 */
export class SharedClaims extends SharedObject<ISharedClaimsEvents> implements ISharedClaims {
	/**
	 * Authoritative sequenced state. Values are stored in their decoded
	 * form (handles already replaced with live {@link IFluidHandle}
	 * instances) so reads are O(1) and need no extra walks.
	 */
	private readonly sequencedClaims = new Map<string, unknown>();

	/**
	 * Keys for which this client's op was the one that won the race for a
	 * claim. Used to disambiguate `"Success"` vs `"AlreadyClaimed"` for
	 * repeat synchronous calls after the op has been sequenced. Purely
	 * local — not persisted in summaries.
	 */
	private readonly wonClaims = new Set<string>();

	/**
	 * Outstanding {@link trySetClaim} attempts whose op has been submitted
	 * locally but not yet sequenced. Keyed by claim key.
	 *
	 * The same {@link Deferred} is returned to every concurrent caller for
	 * the same key, so all callers observe the same eventual outcome.
	 */
	private readonly pendingClaims = new Map<string, Deferred<ClaimResult>>();

	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, "fluid_claims_");

		// Reject any in-flight attempts if the runtime is disposed before
		// the op is sequenced. Without this, a caller awaiting
		// `IClaimAttempt.result` on a disposed runtime would hang
		// indefinitely. We intentionally `reject` (rather than resolve as
		// `"AlreadyClaimed"`) so callers can distinguish "this attempt
		// did not complete" from a sequenced loss.
		runtime.once("dispose", () => {
			const disposeError = new UsageError(
				"Data store runtime was disposed before the claim was sequenced.",
			);
			for (const [, deferred] of this.pendingClaims) {
				deferred.reject(disposeError);
			}
			this.pendingClaims.clear();
		});
	}

	/**
	 * {@inheritDoc ISharedClaims.trySetClaim}
	 */
	public trySetClaim(key: string, value: unknown): IClaimAttempt {
		if (typeof key !== "string" || key.length === 0) {
			throw new UsageError("Claim key must be a non-empty string.");
		}

		// Already sequenced: synchronous, no op submitted.
		if (this.sequencedClaims.has(key)) {
			return { status: this.wonClaims.has(key) ? "Success" : "AlreadyClaimed" };
		}

		// Detached: write directly into local state. The current value
		// will be persisted as part of the attach summary.
		if (!this.isAttached()) {
			this.sequencedClaims.set(key, value);
			this.wonClaims.add(key);
			this.emit("claim-set", key, value);
			return { status: "Success" };
		}

		// Concurrent local attempt for the same key: every caller sees the
		// same outcome.
		const existing = this.pendingClaims.get(key);
		if (existing !== undefined) {
			return { status: "Pending", result: existing.promise };
		}

		const deferred = new Deferred<ClaimResult>();
		this.pendingClaims.set(key, deferred);

		const op: IClaimSetOp = { type: "set", key, value };
		// `submitLocalMessage` runs handle binding / encoding for us; the
		// `key` doubles as the local op metadata so that `rollback` can
		// find the pending Deferred without re-parsing the op.
		this.submitLocalMessage(op, key);

		return { status: "Pending", result: deferred.promise };
	}

	/**
	 * {@inheritDoc ISharedClaims.getClaim}
	 */
	public getClaim(key: string): unknown {
		return this.sequencedClaims.get(key);
	}

	/**
	 * {@inheritDoc ISharedClaims.hasClaim}
	 */
	public hasClaim(key: string): boolean {
		return this.sequencedClaims.has(key);
	}

	/**
	 * {@inheritDoc ISharedClaims.claims}
	 */
	public get claims(): ReadonlyMap<string, unknown> {
		// Defensive copy so callers cannot mutate internal state. Values
		// are already decoded, so this is a shallow clone.
		return new Map(this.sequencedClaims);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.summarizeCore}
	 */
	protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		const content: IClaimsSummaryFormat = {
			entries: [...this.sequencedClaims.entries()],
		};
		// `serializer.stringify` encodes embedded handles and binds them
		// to this DDS's handle so they participate in GC routes.
		return createSingleBlobSummary(snapshotFileName, serializer.stringify(content, this.handle));
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const content = await readAndParse<IClaimsSummaryFormat>(storage, snapshotFileName);
		for (const [k, v] of content.entries) {
			// `serializer.decode` rewires any encoded handle markers into
			// live `IFluidHandle` instances rooted at this runtime.
			this.sequencedClaims.set(k, this.serializer.decode(v));
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObjectCore.onDisconnect}
	 */
	protected onDisconnect(): void {
		// Nothing to do: pending Deferreds remain associated with their
		// not-yet-sequenced ops, and the SharedObject base class will
		// drive `reSubmitCore` for those ops once we reconnect.
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.processMessagesCore}
	 */
	protected override processMessagesCore(
		messagesCollection: IRuntimeMessageCollection,
	): void {
		const { local, messagesContent } = messagesCollection;
		for (const { contents } of messagesContent) {
			const op = contents as IClaimSetOp;
			if (op.type !== "set") {
				// Forward-compat: unknown op types are ignored rather than
				// crashing the data store.
				continue;
			}
			this.applyClaimSet(op.key, op.value, local);
		}
	}

	/**
	 * First-writer-wins application of a sequenced `set` op.
	 */
	private applyClaimSet(key: string, value: unknown, local: boolean): void {
		const winner = !this.sequencedClaims.has(key);
		if (winner) {
			this.sequencedClaims.set(key, value);
			if (local) {
				this.wonClaims.add(key);
			}
			this.emit("claim-set", key, value);
		}
		if (local) {
			const deferred = this.pendingClaims.get(key);
			if (deferred !== undefined) {
				this.pendingClaims.delete(key);
				deferred.resolve(winner ? "Success" : "AlreadyClaimed");
			}
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObjectCore.applyStashedOp}
	 *
	 * Called when an op that was submitted locally before a save / reload
	 * is being re-applied to the freshly-loaded DDS. The op has not yet
	 * been sequenced (it will be resubmitted by the runtime after this
	 * call). All we need to do is register a `Deferred` for the key so
	 * that future local callers of {@link trySetClaim} for the same key
	 * dedupe against the in-flight attempt instead of submitting a
	 * second op.
	 */
	protected applyStashedOp(content: unknown): void {
		const op = content as IClaimSetOp;
		if (op.type !== "set") {
			return;
		}
		if (!this.pendingClaims.has(op.key)) {
			this.pendingClaims.set(op.key, new Deferred<ClaimResult>());
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.rollback}
	 *
	 * A staged claim op is being discarded (e.g. the caller exited
	 * staging mode without committing). The op never reached the
	 * sequencer, so `sequencedClaims` / `wonClaims` were never touched.
	 * All we need to do is reject the in-flight `Deferred` so the
	 * caller's `result` promise does not hang forever.
	 */
	protected override rollback(content: unknown, _localOpMetadata: unknown): void {
		const op = content as IClaimSetOp;
		if (op.type !== "set") {
			return;
		}
		const deferred = this.pendingClaims.get(op.key);
		if (deferred !== undefined) {
			this.pendingClaims.delete(op.key);
			deferred.reject(
				new UsageError("Claim attempt was discarded with staged changes."),
			);
		}
	}
}
