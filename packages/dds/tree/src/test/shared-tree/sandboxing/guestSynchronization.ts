/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LogLevel } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type {
	IIdCompressorCore,
	ShardSynchronizationToken,
} from "@fluidframework/id-compressor/internal";
import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import type { ChangeMetadata, GraphCommit, RevisionTag } from "../../../core/index.js";
import { findAncestor } from "../../../core/index.js";
import type { SharedTreeChange, TreeCheckout } from "../../../shared-tree/index.js";
import { brand } from "../../../util/index.js";

import {
	type GuestChangeAckMessage,
	type GuestChangeId,
	type GuestChangeMessage,
	getRevision,
	type HostUpdateAckMessage,
	type HostUpdateMessage,
	type HostIdRangeMessage,
	makePromiseWithResolvers,
	type PromiseWithResolvers,
	SandboxProtocolError,
} from "./common.js";
import type { GuestBranchInitialization } from "./hostSynchronization.js";

/**
 * The Guest synchronization lifecycle.
 *
 * @remarks
 * For an orderly close, the owning Guest moves synchronization from active to closing.
 * After the Host acknowledges the disposal token, the Guest moves it to closed
 * and then disposed.
 *
 * On protocol failure, the session moves synchronization from active or closing
 * to closed without disposing the checkouts. The application must dispose the Guest
 * to release them after failure reporting.
 *
 * Application disposal before an orderly close calls `Guest.dispose()`, which closes
 * and disposes synchronization without waiting for a close acknowledgment.
 */
enum GuestSynchronizationState {
	/**
	 * Accepts new Guest edits and processes synchronization messages.
	 */
	Active = "active",
	/**
	 * The edit listener is removed, but earlier Guest changes can still be acknowledged.
	 * @remarks
	 * Orderly close disposes the authoring view before the child ID space shard.
	 */
	Closing = "closing",
	/**
	 * Synchronization is terminal. The owner no longer routes messages, and any pending changes have been rejected.
	 * Both checkouts remain until disposal unless orderly close already disposed the authoring checkout.
	 * If a failure occurs before orderly close, the authoring checkout remains available
	 * for inspection if it is still usable.
	 */
	Closed = "closed",
	/**
	 * Both checkouts have been released.
	 * @remarks
	 * The authoring checkout might already have been released by orderly close.
	 */
	Disposed = "disposed",
}

/**
 * Synchronizes the Guest's tree with the Host.
 * @remarks
 * This class owns both checkouts, the child ID space shard, and synchronization.
 * The `Guest` owns initialization, transport encoding, message routing, and session lifetime.
 *
 * The hidden {@link hostCheckout} branch reconstructs the Host's main branch from ordered updates.
 * The authoring {@link checkout} branch contains Guest-authored commits on top of the last received Host state.
 * Each Host update replaces a suffix of {@link hostCheckout}, after which {@link checkout} rebases its local commits
 * onto the updated Host head.
 *
 * The owning {@link Guest} calls {@link close} for an orderly close.
 * This class stops new edits and disposes the authoring view before it can dispose
 * the child ID space shard. It waits for earlier Guest changes to be acknowledged
 * before it disposes the shard and returns its disposal token.
 * When the Host confirms reclamation, the Guest disposes its session, which calls
 * {@link closeForError} and then {@link dispose}.
 *
 * On protocol failure, the session calls {@link closeForError} from active or closing.
 * This does not dispose either checkout, so the application can inspect the authoring checkout if
 * orderly close has not already disposed it and the checkout is still usable.
 * The edit listener is removed, but retained references can still edit the view.
 * The application must not make further edits after a failure.
 * The application must then dispose the Guest to release both checkouts.
 * This failure path does not request shard reclamation.
 *
 * On local disposal before an orderly close, `Guest.dispose()` calls both methods.
 *
 */
export class GuestSynchronization {
	/**
	 * The Guest's authoring checkout, rebased over updates applied to {@link hostCheckout}.
	 * @remarks
	 * Orderly close disposes this checkout. After a failure before orderly close,
	 * the Guest can inspect it until application-managed cleanup calls {@link dispose}.
	 */
	public readonly checkout: TreeCheckout;
	/** Guest changes sent to the Host that have not been acknowledged. */
	private readonly pendingChanges = new Set<GuestChangeId>();
	/** The promise and resolver for acknowledgment of all pending Guest changes. */
	private pushInProgress?: PromiseWithResolvers;
	/** The Host main revision on which the next Guest change will be based. */
	private mainRevision: RevisionTag;
	/** The Host finalized-history boundary on which the next Guest change will be based. */
	private trunkRevision: RevisionTag;
	/** Host commits indexed by revision for validating and applying branch updates. */
	private readonly hostCommits = new Map<RevisionTag, GraphCommit<SharedTreeChange>>();
	/** The identifier to assign to the next Guest change. */
	private nextChangeId = 0;
	/** The identifier expected on the next Host update. */
	private nextHostUpdateId = 0;
	/** The next finalized creation range expected from the Host. */
	private nextHostIdRangeId = 0;
	/**
	 * Most recent parent generation count accepted on this ordered channel.
	 * @remarks
	 * Starts at `-1` to mean that no parent progress has arrived.
	 * Valid counts start at zero, so the first update can report zero.
	 */
	private lastParentGenerationCount = -1;
	/** The callback that unsubscribes from authoring-tree changes. */
	private readonly offCheckoutChanged: () => void;

	/**
	 * The current synchronization state.
	 * An idle session stays active until close or failure begins.
	 */
	private state = GuestSynchronizationState.Active;

	public constructor(
		/** The Guest's initial copy of the Host main branch. This class owns and disposes it. */
		public readonly hostCheckout: TreeCheckout,
		/** The revisions and commits needed to initialize the Host branch. */
		initialization: GuestBranchInitialization,
		/** The independent child compressor owned by this class and used by both Guest views. */
		private readonly idCompressor: IIdCompressorCore,
		/** Sends a synchronization protocol message to the Host. */
		private readonly send: (message: GuestChangeMessage | HostUpdateAckMessage) => void,
		/** Runs an action within the Guest session's error-handling boundary. */
		private readonly run: (action: () => void) => void,
		/** Reports an asynchronous synchronization failure to the Guest session. */
		private readonly fail: (error: unknown) => void,
		/** The scoped logger for synchronization diagnostics. */
		private readonly logger: TelemetryLoggerExt,
	) {
		this.mainRevision = initialization.mainRevision;
		this.trunkRevision = initialization.trunkRevision;
		this.hostCommits.set(initialization.baseRevision, this.hostCheckout.mainBranch.getHead());
		this.applyHostBranchUpdate(initialization);
		this.checkout = hostCheckout.fork();
		this.offCheckoutChanged = this.checkout.events.on(
			"changed",
			(metadata: ChangeMetadata) => {
				this.run(() => {
					// Only Guest-authored changes are sent. Host updates rebase this tree non-locally.
					if (!metadata.isLocal) {
						return;
					}
					if (this.nextChangeId > Number.MAX_SAFE_INTEGER) {
						throw new SandboxProtocolError("Guest change identifiers are exhausted.");
					}
					const change = metadata.getChange();
					// getChange() serializes the change and can mint IDs; read progress afterward.
					const idSpaceShardToken = this.idCompressor.getShardSyncToken();
					assert(
						idSpaceShardToken !== undefined,
						"Guest edits require a child ID space shard",
					);
					assert(!idSpaceShardToken.disposed, "Guest change needs a live ID space shard");
					const changeId = brand<GuestChangeId>(this.nextChangeId++);
					if (this.pushInProgress === undefined) {
						this.pushInProgress = makePromiseWithResolvers();
						this.pushInProgress.promise.catch((error: unknown) => this.fail(error));
					}
					this.pendingChanges.add(changeId);
					this.log(
						`Sending change ${changeId} [${getRevision(change)}] based on main ${this.mainRevision}`,
					);
					this.send({
						type: "guestChange",
						changeId,
						mainRevision: this.mainRevision,
						trunkRevision: this.trunkRevision,
						change,
						idSpaceShardToken: { ...idSpaceShardToken, disposed: false },
					});
				});
			},
		);
	}

	/**
	 * Applies a Host branch transition and rebases Guest-local commits over it.
	 *
	 * @remarks
	 * Parent ID progress is applied before the Guest reads IDs in the Host update.
	 * The Guest routes these updates only while synchronization is active.
	 *
	 * @param message - The Host update and its parent ID progress.
	 */
	public receiveHostUpdate(message: HostUpdateMessage): void {
		if (message.updateId !== this.nextHostUpdateId) {
			throw new SandboxProtocolError(
				`Host update identifier order mismatch: received ${message.updateId}, expected ${this.nextHostUpdateId}.`,
			);
		}
		this.nextHostUpdateId++;
		this.applyParentIdProgress(message.parentIdProgress);
		this.log(
			`Applying update ${message.updateId} from ${message.baseRevision} to ${message.mainRevision}`,
		);
		this.applyHostBranchUpdate(message);
		this.mainRevision = message.mainRevision;
		this.trunkRevision = message.trunkRevision;
		this.checkout.rebaseOnto(this.hostCheckout);
		this.send({ type: "hostUpdateAck", updateId: message.updateId });
	}

	/**
	 * Applies an ID creation range that the Host has already finalized.
	 *
	 * @remarks
	 * The Host sends these ranges in finalization order, even when no tree change occurs.
	 * This method checks the message's range ID to detect a missing or repeated range.
	 * It applies parent ID progress first, so the Guest knows about Host-generated IDs in
	 * the range. It then finalizes the range in the Guest compressor.
	 * Later Host updates can use the IDs in that range without replacing the Guest compressor.
	 * The next range ID advances only after finalization succeeds.
	 *
	 * @param message - The finalized range and the Host's parent ID progress.
	 * @throws {@link SandboxProtocolError} if the range is out of order or its progress or contents cannot be applied.
	 */
	public receiveHostIdRange(message: HostIdRangeMessage): void {
		if (message.rangeId !== this.nextHostIdRangeId) {
			throw new SandboxProtocolError("Host ID range identifier order mismatch.");
		}
		this.applyParentIdProgress(message.parentIdProgress);
		try {
			this.idCompressor.finalizeCreationRange(message.range);
		} catch (error) {
			throw new SandboxProtocolError("Invalid finalized Host ID range.", { cause: error });
		}
		this.nextHostIdRangeId++;
	}

	/**
	 * Gives the Guest compressor the Host's latest ID generation count.
	 *
	 * @remarks
	 * Host updates and finalized-range messages call this method before they use IDs that
	 * the Guest may not know. It accepts progress only for this Guest's ID space shard.
	 * A count can equal the last accepted count, but it cannot be lower.
	 * The method records the count only after compressor synchronization succeeds.
	 *
	 * @param progress - Parent progress received from the Host.
	 * @throws {@link SandboxProtocolError} if the progress is for another ID space shard, moves backward, or otherwise cannot be applied.
	 */
	private applyParentIdProgress(progress: HostUpdateMessage["parentIdProgress"]): void {
		const token = this.idCompressor.getShardSyncToken();
		if (token?.shardId !== progress.shardId) {
			throw new SandboxProtocolError("Host ID progress targets another ID space shard.");
		}
		if (progress.localGenCount < this.lastParentGenerationCount) {
			throw new SandboxProtocolError("Host ID progress moved backward.");
		}
		try {
			this.idCompressor.synchronizeWithParent(progress);
		} catch (error) {
			throw new SandboxProtocolError("Invalid Host ID progress.", { cause: error });
		}
		this.lastParentGenerationCount = progress.localGenCount;
	}

	private applyHostBranchUpdate(message: GuestBranchInitialization): void {
		const base = this.hostCommits.get(message.baseRevision);
		const currentHead = this.hostCheckout.mainBranch.getHead();
		const removedCommits: GraphCommit<SharedTreeChange>[] = [];
		if (
			base === undefined ||
			findAncestor([currentHead, removedCommits], (commit) => commit === base) === undefined
		) {
			throw new SandboxProtocolError("Host update has an unknown base revision.");
		}
		for (const commit of removedCommits) {
			this.hostCommits.delete(commit.revision);
		}
		this.hostCheckout.mainBranch.removeAfter(base);
		for (const commit of message.commits) {
			this.hostCheckout.applyChange(commit);
		}
		for (
			let commit: GraphCommit<SharedTreeChange> | undefined =
				this.hostCheckout.mainBranch.getHead();
			commit !== base;
			commit = commit.parent
		) {
			assert(commit !== undefined, "Updated Host branch must descend from its base");
			this.hostCommits.set(commit.revision, commit);
		}
		// The snapshot's baseline revision aliases the independent checkout's initial head.
		if (
			this.hostCommits.get(message.mainRevision) !== this.hostCheckout.mainBranch.getHead()
		) {
			throw new SandboxProtocolError(
				"Host update did not produce its declared main revision.",
			);
		}
		const trunk = this.hostCommits.get(message.trunkRevision);
		if (
			trunk === undefined ||
			findAncestor(this.hostCheckout.mainBranch.getHead(), (commit) => commit === trunk) ===
				undefined
		) {
			throw new SandboxProtocolError(
				"Host trunk revision is not an ancestor of its main revision.",
			);
		}
	}

	/**
	 * Processes an acknowledgment for a Guest change.
	 * Acknowledgments remain necessary while closing so the Guest can finish sending
	 * earlier changes before it sends its disposal token.
	 *
	 * @param message - The Guest change acknowledgment.
	 */
	public receiveChangeAck(message: GuestChangeAckMessage): void {
		if (!this.pendingChanges.delete(message.changeId)) {
			throw new SandboxProtocolError("Unexpected Guest change acknowledgment.");
		}
		this.log(`Change ${message.changeId} acknowledged`);
		if (this.pendingChanges.size === 0) {
			assert(this.pushInProgress !== undefined, "Missing push promise for Guest changes");
			const resolver = this.pushInProgress.resolver;
			this.pushInProgress = undefined;
			resolver();
		}
	}

	/**
	 * Returns a promise that resolves when the Host acknowledges all pending Guest changes,
	 * or undefined if there are no pending changes.
	 * Pending promises reject if the session stops before acknowledgment.
	 */
	public get updateHostPromise(): Promise<void> | undefined {
		return this.pushInProgress?.promise;
	}

	/**
	 * Stops new Guest edits and returns a disposal token after earlier changes are acknowledged.
	 *
	 * @remarks
	 * This moves synchronization from active to closing, not to closed.
	 * It removes the edit listener, then disposes the authoring view so retained
	 * authoring references cannot create IDs after the child ID space shard is disposed.
	 * Acknowledgments for changes already sent can still arrive. After they arrive,
	 * this class disposes the child ID space shard and returns its disposal token.
	 * A repeated call fails without disposing the view or child ID space shard again.
	 * View disposal happens synchronously; if it fails, this method throws before
	 * the Guest records the view as disposed.
	 *
	 * @returns A promise for the final ID space shard disposal token.
	 */
	// eslint-disable-next-line @typescript-eslint/promise-function-async -- View disposal failures must throw before Guest marks the view as disposed.
	public close(): Promise<ShardSynchronizationToken> {
		assert(
			this.state === GuestSynchronizationState.Active,
			"Cannot close Guest synchronization after closing has begun",
		);
		this.state = GuestSynchronizationState.Closing;
		this.offCheckoutChanged();

		const pending = this.pushInProgress?.promise;
		this.checkout.dispose();
		return Promise.resolve(pending).then(() => {
			if (this.state !== GuestSynchronizationState.Closing) {
				throw new Error(
					"Guest synchronization closed before its ID space shard could be disposed.",
				);
			}
			const token = this.idCompressor.disposeShard();
			assert(token !== undefined, "Expected an ID space shard disposal token");
			return token;
		});
	}

	/**
	 * Stops Guest synchronization and rejects pending changes without releasing the checkouts.
	 *
	 * @remarks
	 * The session calls this on failure. Guest disposal also calls it after an
	 * orderly close or abort. It removes the edit listener if necessary.
	 * It does not release either checkout or reclaim the ID space shard.
	 * After a failure, the application can inspect the view if it
	 * is still usable and orderly close has not already disposed it.
	 * After an orderly close, no changes remain to reject.
	 * Repeated calls have no effect.
	 *
	 * @param error - The reason pending Guest changes cannot complete.
	 */
	public closeForError(error: Error): void {
		if (
			this.state === GuestSynchronizationState.Closed ||
			this.state === GuestSynchronizationState.Disposed
		) {
			return;
		}
		if (this.state === GuestSynchronizationState.Active) {
			this.state = GuestSynchronizationState.Closing;
			this.offCheckoutChanged();
		}
		this.state = GuestSynchronizationState.Closed;
		this.pendingChanges.clear();
		this.pushInProgress?.rejecter(error);
		this.pushInProgress = undefined;
	}

	/**
	 * Stops synchronization and releases both checkouts.
	 *
	 * @remarks
	 * The Guest calls this when it disposes its session, after a successful close,
	 * an abort, or application-managed failure cleanup.
	 * It calls {@link closeForError} to stop active or closing synchronization,
	 * then releases the hidden {@link hostCheckout} branch and authoring {@link checkout}.
	 * The authoring checkout may already be disposed after an orderly close.
	 * On abort or failure, it does not dispose the ID space shard.
	 * Only orderly close produces a token that lets the Host safely reclaim it.
	 * Repeated calls have no effect.
	 */
	public dispose(): void {
		if (this.state === GuestSynchronizationState.Disposed) {
			return;
		}
		this.closeForError(
			new Error("Guest synchronization disposed before synchronization completed."),
		);
		this.state = GuestSynchronizationState.Disposed;

		// TODO: Support cleanup of already-broken checkouts and invalidation of retained node references.

		this.hostCheckout.dispose();
		if (!this.checkout.disposed) {
			this.checkout.dispose();
		}
	}

	private log(message: string): void {
		this.logger.sendTelemetryEvent(
			{ eventName: "Synchronization", message },
			undefined,
			LogLevel.verbose,
		);
	}
}
