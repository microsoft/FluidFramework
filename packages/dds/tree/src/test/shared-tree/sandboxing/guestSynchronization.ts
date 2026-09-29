/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LogLevel } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import type { ChangeMetadata, GraphCommit, RevisionTag } from "../../../core/index.js";
import { findAncestor } from "../../../core/index.js";
import type { SharedTreeChange } from "../../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- The sandbox Guest requires internal Simple Tree APIs.
import type { TreeViewAlpha } from "../../../simple-tree/api/index.js";
import type { ImplicitFieldSchema } from "../../../simple-tree/index.js";
import { brand } from "../../../util/index.js";

import {
	type GuestChangeAckMessage,
	type GuestChangeId,
	type GuestChangeMessage,
	getRevision,
	type HostUpdateAckMessage,
	type HostUpdateMessage,
	makePromiseWithResolvers,
	type PromiseWithResolvers,
	SandboxProtocolError,
} from "./common.js";
import type { GuestBranchInitialization } from "./hostSynchronization.js";
import { applyBranchUpdate, getBranch } from "./synchronizationUtils.js";

/**
 * Synchronizes the Guest's view with the Host.
 * @remarks
 * This class owns branch synchronization only.
 * The `Guest` owns initialization, transport encoding, message routing, and session lifetime.
 *
 * The hidden {@link host} branch reconstructs the Host's main branch from ordered updates.
 * The public {@link view} branch contains Guest-authored commits on top of the last received Host state.
 * Each Host update replaces a suffix of {@link host}, after which {@link view} rebases its local commits
 * onto the updated Host head.
 */
export class GuestSynchronization<const TSchema extends ImplicitFieldSchema> {
	/**
	 * The Guest's authoring view, rebased over updates applied to {@link host}.
	 * @remarks
	 * While this creates the view and keeps it up to date, it does not own the view: it is owned by the {@link Guest}.
	 * Thus its possible to use the view after syncing has stopped, for example to view or stash unsaved changes.
	 * The guest currently does not use this ability for anything, but it makes sense to allow it from the perspective of
	 * GuestSynchronization.
	 */
	public readonly view: TreeViewAlpha<TSchema>;
	/** Guest changes sent to the Host that have not been acknowledged. */
	private readonly pendingChanges = new Set<GuestChangeId>();
	/** The promise and resolver for acknowledgment of all pending Guest changes. */
	private pushInProgress?: PromiseWithResolvers;
	/** The Host main revision on which the next Guest change will be based. */
	private mainRevision: RevisionTag;
	/** The sequenced Host revision on which the next Guest change will be based. */
	private trunkRevision: RevisionTag;
	/** Host commits indexed by revision for validating and applying branch updates. */
	private readonly hostCommits = new Map<RevisionTag, GraphCommit<SharedTreeChange>>();
	/** The identifier to assign to the next Guest change. */
	private nextChangeId = 0;
	/** The identifier expected on the next Host update. */
	private nextHostUpdateId = 0;
	/** The callback that unsubscribes from authoring-view changes. */
	private readonly offViewChanged: () => void;
	/**
	 * Whether synchronization has stopped.
	 *
	 * @remarks
	 * Stopping is terminal and removes the view-change listener.
	 * An idle session with no pending changes is not stopped.
	 */
	private stopped = false;
	/** Whether the hidden Host branch has been disposed. */
	private disposed = false;

	public constructor(
		/** The Guest's initial copy of the Host main branch. */
		public readonly host: TreeViewAlpha<TSchema>,
		/** The revisions and commits needed to initialize the Host branch. */
		initialization: GuestBranchInitialization,
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
		this.hostCommits.set(initialization.baseRevision, getBranch(this.host).getHead());
		this.applyHostBranchUpdate(initialization);
		this.view = host.fork();
		this.offViewChanged = this.view.events.on("changed", (metadata: ChangeMetadata) => {
			this.run(() => {
				// Only Guest-authored changes are sent. Host updates rebase this view non-locally.
				if (!metadata.isLocal) {
					return;
				}
				if (this.nextChangeId > Number.MAX_SAFE_INTEGER) {
					throw new SandboxProtocolError("Guest change identifiers are exhausted.");
				}
				const change = metadata.getChange();
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
				});
			});
		});
	}

	/**
	 * Applies a Host branch transition and rebases Guest-local commits over it.
	 */
	public receiveHostUpdate(message: HostUpdateMessage): void {
		if (message.updateId !== this.nextHostUpdateId) {
			throw new SandboxProtocolError(
				`Host update identifier order mismatch: received ${message.updateId}, expected ${this.nextHostUpdateId}.`,
			);
		}
		this.nextHostUpdateId++;
		this.log(
			`Applying update ${message.updateId} from ${message.baseRevision} to ${message.mainRevision}`,
		);
		this.applyHostBranchUpdate(message);
		this.mainRevision = message.mainRevision;
		this.trunkRevision = message.trunkRevision;
		this.view.rebaseOnto(this.host);
		this.send({ type: "hostUpdateAck", updateId: message.updateId });
	}

	private applyHostBranchUpdate(message: GuestBranchInitialization): void {
		const base = this.hostCommits.get(message.baseRevision);
		const currentHead = getBranch(this.host).getHead();
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
		applyBranchUpdate(this.host, base, message.commits);
		for (
			let commit: GraphCommit<SharedTreeChange> | undefined = getBranch(this.host).getHead();
			commit !== base;
			commit = commit.parent
		) {
			assert(commit !== undefined, "Updated Host branch must descend from its base");
			this.hostCommits.set(commit.revision, commit);
		}
		// The snapshot's baseline revision aliases the independent checkout's initial head.
		if (this.hostCommits.get(message.mainRevision) !== getBranch(this.host).getHead()) {
			throw new SandboxProtocolError(
				"Host update did not produce its declared main revision.",
			);
		}
		const trunk = this.hostCommits.get(message.trunkRevision);
		if (
			trunk === undefined ||
			findAncestor(getBranch(this.host).getHead(), (commit) => commit === trunk) === undefined
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
	 * Returns a promise that resolves when the Host acknowledges all Guest changes.
	 */
	public get updateHostPromise(): Promise<void> | undefined {
		return this.pushInProgress?.promise;
	}

	/** Stops synchronization and rejects pending work. */
	public stop(error: Error): void {
		if (this.stopped) {
			return;
		}
		this.stopped = true;
		this.offViewChanged();
		this.pendingChanges.clear();
		this.pushInProgress?.rejecter(error);
		this.pushInProgress = undefined;
	}

	/**
	 * Stops synchronization and releases the hidden Host branch.
	 *
	 * @remarks
	 * Disposal is terminal and idempotent.
	 *
	 * This stops syncing the view with the host,
	 * but does not dispose the view itself (Which is owned by the {@link Guest}).
	 */
	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.stop(new Error("Guest synchronization disposed before synchronization completed."));
		this.disposed = true;
		this.host.dispose();
	}

	private log(message: string): void {
		this.logger.sendTelemetryEvent(
			{ eventName: "Synchronization", message },
			undefined,
			LogLevel.verbose,
		);
	}
}
