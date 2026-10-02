/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LogLevel } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { IIdCompressorCore } from "@fluidframework/id-compressor/internal";
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
 * Disposal stops edits and releases both checkouts and the ID space shard.
 *
 * On protocol failure, the session moves synchronization from active
 * to stopped without disposing the checkouts. The application must dispose the Guest
 * to release them after failure reporting.
 */
enum GuestSynchronizationState {
	/**
	 * Accepts new Guest edits and processes synchronization messages.
	 */
	Active = "active",
	/**
	 * Synchronization is terminal. The owner no longer routes messages, and any pending changes have been rejected.
	 * Both checkouts remain until disposal. The authoring checkout remains available
	 * for inspection if it is still usable.
	 */
	Stopped = "stopped",
	/**
	 * Both checkouts have been released.
	 * @remarks
	 * The child shard has also been disposed.
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
 * The owning {@link Guest} calls {@link dispose} to stop new edits and dispose both
 * checkouts and the child shard without waiting for acknowledgments.
 *
 * On protocol failure, the session calls {@link stop} from active.
 * This does not dispose either checkout, so the application can inspect the authoring checkout if
 * the checkout is still usable.
 * The edit listener is removed, but retained references can still edit the view.
 * The application must not make further edits after a failure.
 * The application must then dispose the Guest to release both checkouts.
 * The orchestrator must fence the Guest and dispose the Host to reclaim its shard.
 *
 */
export class GuestSynchronization {
	/**
	 * The Guest's authoring checkout, rebased over updates applied to {@link hostCheckout}.
	 * @remarks
	 * Disposal releases this checkout. After a failure,
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
	 * An idle session stays active until failure or disposal.
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

	/** Processes the Host's acknowledgment of a Guest change. */
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
	 * Stops Guest synchronization and rejects pending changes without releasing the checkouts.
	 *
	 * @remarks
	 * The session calls this on failure. Guest disposal also calls it after an
	 * application teardown. It removes the edit listener if necessary.
	 * It does not release either checkout or reclaim the ID space shard.
	 * After a failure, the application can inspect the view if it
	 * is still usable.
	 * Repeated calls have no effect.
	 *
	 * @param error - The reason pending Guest changes cannot complete.
	 */
	public stop(error: Error): void {
		if (this.state !== GuestSynchronizationState.Active) {
			return;
		}
		this.offCheckoutChanged();
		this.state = GuestSynchronizationState.Stopped;
		this.pendingChanges.clear();
		this.pushInProgress?.rejecter(error);
		this.pushInProgress = undefined;
	}

	/**
	 * Stops synchronization, releases both checkouts, and disposes the child shard.
	 *
	 * @remarks
	 * The Guest calls this during application-managed teardown or failure cleanup.
	 * It calls {@link stop} to stop active synchronization,
	 * then releases the hidden {@link hostCheckout} branch and authoring {@link checkout}.
	 * The authoring checkout must be disposed before the compressor to prevent new IDs.
	 * Repeated calls have no effect.
	 */
	public dispose(): void {
		if (this.state === GuestSynchronizationState.Disposed) {
			return;
		}
		this.stop(new Error("Guest synchronization disposed before synchronization completed."));
		this.state = GuestSynchronizationState.Disposed;

		// TODO: Support cleanup of already-broken checkouts and invalidation of retained node references.

		this.hostCheckout.dispose();
		if (!this.checkout.disposed) {
			this.checkout.dispose();
		}

		this.idCompressor.disposeShard();
	}

	private log(message: string): void {
		this.logger.sendTelemetryEvent(
			{ eventName: "Synchronization", message },
			undefined,
			LogLevel.verbose,
		);
	}
}
