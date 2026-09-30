/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LogLevel } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import {
	findAncestor,
	findCommonAncestor,
	type GraphCommit,
	type RevisionTag,
} from "../../../core/index.js";
import type { SharedTreeChange, TreeCheckout } from "../../../shared-tree/index.js";
import type { JsonCompatibleReadOnly } from "../../../util/index.js";
import { brand } from "../../../util/index.js";

import {
	type GuestChangeAckMessage,
	type GuestChangeMessage,
	type HostInitializationMessage,
	type HostUpdateAckMessage,
	type HostUpdateId,
	type HostUpdateMessage,
	makePromiseWithResolvers,
	type PromiseWithResolvers,
	SandboxProtocolError,
} from "./common.js";

/**
 * A finalized snapshot and the subsequent commits needed to reconstruct the Host branch.
 * Subsequent commits must be replayed so that the Guest can rebase them if the Host history changes.
 */
export type GuestBranchInitialization = Omit<
	HostInitializationMessage,
	"type" | "tree" | "schema"
>;

/** A Host update awaiting the Guest's acknowledgment. */
interface PendingHostUpdate {
	/** The exact Host main-branch state sent in the update. */
	readonly branch: TreeCheckout["mainBranch"];
	/** The finalized-history boundary sent in the update. */
	readonly trunkRevision: RevisionTag;
}

/**
 * Synchronizes the Host's main branch with the Guest.
 * @remarks
 * This class owns branch synchronization only.
 * The `Host` owns transport encoding, message routing, and session lifetime.
 */
export class HostSynchronization {
	/** Host updates awaiting ordered acknowledgments, with the exact branch state sent for each update. */
	private readonly pendingUpdates = new Map<HostUpdateId, PendingHostUpdate>();
	/**
	 * The baseline and retained commits used to initialize this session.
	 */
	public readonly guestInitialization: GuestBranchInitialization;
	/** Host main revision included in the latest update acknowledged by the Guest. */
	private guestMainRevision: RevisionTag;
	/** Host finalized-history boundary included in the latest update acknowledged by the Guest. */
	private guestTrunkRevision: RevisionTag;
	/** The promise and resolver for acknowledgment of all pending Host updates. */
	private updateInProgress?: PromiseWithResolvers;
	/** Host main-branch head included in the latest update sent to the Guest. */
	private sentHead: GraphCommit<SharedTreeChange>;
	/** Host finalized-history boundary included in the latest update sent to the Guest. */
	private sentTrunkRevision: RevisionTag;
	/** The identifier to assign to the next Host update. */
	private nextUpdateId = 0;
	/** The identifier expected on the next Guest change. */
	private nextGuestChangeId = 0;
	/** The callback that unsubscribes from Host main-branch changes. */
	private readonly offAfterChange: () => void;
	/** The callback that unsubscribes from Host commit sequencing. */
	private readonly offCommitSequenced: () => void;
	/** Whether synchronization has stopped. Any work pending when it stopped was rejected. */
	private stopped = false;
	/** Whether the branches owned by this synchronization state have been disposed. */
	private disposed = false;

	public constructor(
		/** The Host's main checkout to synchronize with the Guest. */
		private readonly mainCheckout: TreeCheckout,
		/** The checkout for the Guest's authoring branch, advanced by Guest changes and acknowledged Host updates. */
		private readonly localCheckout: TreeCheckout,
		/**
		 * Sends a synchronization protocol message to the Guest.
		 */
		private readonly send: (message: HostUpdateMessage | GuestChangeAckMessage) => void,
		/**
		 * Binds handles in a change from the Guest to the Host's SharedTree.
		 */
		private readonly bindHandles: (change: JsonCompatibleReadOnly) => void,
		/**
		 * Runs an action within the Host session's error-handling boundary.
		 */
		private readonly run: (action: () => void) => void,
		/**
		 * Reports an asynchronous synchronization failure to the Host session.
		 */
		private readonly fail: (error: unknown) => void,
		/**
		 * The scoped logger for synchronization diagnostics.
		 */
		private readonly logger: TelemetryLoggerExt,
	) {
		const branch = this.mainCheckout.mainBranch;
		this.sentHead = branch.getHead();
		const trunkRevision = this.mainCheckout.getFinalizedCommit().revision;
		const commits: GraphCommit<SharedTreeChange>[] = [];
		const base = findAncestor(
			[this.sentHead, commits],
			(commit) => commit.revision === trunkRevision,
		);
		assert(base !== undefined, "Host branch must contain its finalized-history boundary");
		this.sentTrunkRevision = trunkRevision;
		this.guestMainRevision = this.sentHead.revision;
		this.guestTrunkRevision = trunkRevision;
		this.guestInitialization = {
			baseRevision: base.revision,
			mainRevision: this.guestMainRevision,
			trunkRevision: this.guestTrunkRevision,
			commits: commits.map((commit) => this.mainCheckout.serializeCommit(commit)),
		};
		this.offAfterChange = branch.events.on("afterChange", () => {
			this.run(() => this.sendMainUpdate());
		});
		this.offCommitSequenced = branch.events.on("commitSequenced", () => {
			this.run(() => this.sendMainUpdate());
		});
	}

	/**
	 * Applies a Guest change from the Host state on which the Guest authored it.
	 */
	public receiveChangeFromGuest(message: GuestChangeMessage): void {
		if (message.changeId !== this.nextGuestChangeId) {
			throw new SandboxProtocolError(
				`Guest change identifier order mismatch: received ${message.changeId}, expected ${this.nextGuestChangeId}.`,
			);
		}
		this.nextGuestChangeId++;
		if (message.mainRevision !== this.guestMainRevision) {
			throw new SandboxProtocolError(
				"Guest main revision does not match its acknowledged Host state.",
			);
		}
		if (message.trunkRevision !== this.guestTrunkRevision) {
			throw new SandboxProtocolError(
				"Guest trunk revision does not match its acknowledged Host state.",
			);
		}

		this.log(
			`Received Guest change ${message.changeId} based on main ${message.mainRevision}`,
		);
		this.localCheckout.applyChange(message.change);
		this.bindHandles(message.change);
		// Merge rebases a copy, leaving local at the state used to author the next Guest change.
		this.mainCheckout.merge(this.localCheckout, false);
		this.send({ type: "guestChangeAck", changeId: message.changeId });
	}

	/**
	 * Processes an acknowledgment for a Host branch update.
	 */
	public receiveUpdateAck(message: HostUpdateAckMessage): void {
		const update = this.pendingUpdates.get(message.updateId);
		if (update === undefined || this.pendingUpdates.keys().next().value !== message.updateId) {
			throw new SandboxProtocolError("Unexpected Host update acknowledgment.");
		}
		// A revision can be rebased while its update is in flight. Use the exact state sent.
		this.localCheckout.mainBranch.rebaseOnto(update.branch);
		this.guestMainRevision = update.branch.getHead().revision;
		this.guestTrunkRevision = update.trunkRevision;
		this.pendingUpdates.delete(message.updateId);
		update.branch.dispose();
		this.log(`Update ${message.updateId} acknowledged`);
		if (this.pendingUpdates.size === 0) {
			const resolver = this.updateInProgress?.resolver;
			this.updateInProgress = undefined;
			resolver?.();
		}
	}

	/**
	 * Returns a promise that resolves when the Guest acknowledges all Host branch updates.
	 */
	public get updateGuestPromise(): Promise<void> | undefined {
		return this.updateInProgress?.promise;
	}

	/**
	 * Stops synchronization and rejects pending work without disposing the owned branches.
	 *
	 * @remarks
	 * Stopping is terminal for synchronization but does not release branch resources.
	 * Call {@link HostSynchronization.dispose} to release those resources.
	 */
	public stop(error: Error): void {
		if (this.stopped) {
			return;
		}
		this.stopped = true;
		this.offAfterChange();
		this.offCommitSequenced();
		for (const update of this.pendingUpdates.values()) {
			update.branch.dispose();
		}
		this.pendingUpdates.clear();
		this.updateInProgress?.rejecter(error);
		this.updateInProgress = undefined;
	}

	/**
	 * Stops synchronization and releases the branches owned by this synchronization state.
	 *
	 * @remarks
	 * Disposal is terminal and idempotent.
	 * If synchronization has not already stopped, this method stops it and rejects pending work
	 * with a disposal error before releasing branch resources.
	 */
	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.stop(new Error("Host synchronization disposed before synchronization completed."));
		this.disposed = true;
		this.localCheckout.dispose();
	}

	private sendMainUpdate(): void {
		const head = this.mainCheckout.mainBranch.getHead();
		const trunkRevision = this.mainCheckout.getFinalizedCommit().revision;
		const commits: GraphCommit<SharedTreeChange>[] = [];
		const base = findCommonAncestor(this.sentHead, [head, commits]);
		assert(base !== undefined, "Host branch updates must share ancestry");
		if (head === this.sentHead && trunkRevision === this.sentTrunkRevision) {
			return;
		}
		if (this.nextUpdateId > Number.MAX_SAFE_INTEGER) {
			throw new SandboxProtocolError("Host update identifiers are exhausted.");
		}
		const updateId = brand<HostUpdateId>(this.nextUpdateId++);
		if (this.updateInProgress === undefined) {
			this.updateInProgress = makePromiseWithResolvers();
			this.updateInProgress.promise.catch((error: unknown) => this.fail(error));
		}
		this.pendingUpdates.set(updateId, {
			branch: this.mainCheckout.mainBranch.fork(),
			trunkRevision,
		});
		this.sentHead = head;
		this.sentTrunkRevision = trunkRevision;
		this.log(`Sending update ${updateId} from ${base.revision} to ${head.revision}`);
		this.send({
			type: "hostUpdate",
			updateId,
			baseRevision: base.revision,
			mainRevision: head.revision,
			trunkRevision,
			commits: commits.map((commit) => this.mainCheckout.serializeCommit(commit)),
		});
	}

	private log(message: string): void {
		this.logger.sendTelemetryEvent(
			{ eventName: "Synchronization", message },
			undefined,
			LogLevel.verbose,
		);
	}
}
