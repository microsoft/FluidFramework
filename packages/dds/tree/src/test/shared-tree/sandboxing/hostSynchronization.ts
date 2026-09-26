/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { findCommonAncestor, type GraphCommit } from "../../../core/index.js";
import { SchematizingSimpleTreeView } from "../../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- The sandbox Host requires internal Simple Tree APIs.
import type { TreeViewAlpha } from "../../../simple-tree/api/index.js";
import type { ImplicitFieldSchema, UnsafeUnknownSchema } from "../../../simple-tree/index.js";
import type { JsonCompatibleReadOnly } from "../../../util/index.js";

import {
	type AcknowledgmentMessage,
	type DataChangeMessage,
	getRevision,
	makePromiseWithResolvers,
	type PromiseWithResolvers,
	SandboxProtocolError,
} from "./common.js";

/**
 * Gets the revisions of the commits that are in the `ahead` view but not in the `behind` view.
 * The returned list includes commits that are in both views but have a different base.
 * Used for debugging and logging purposes only.
 */
function getMissingCommits<TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema>(
	behind: TreeViewAlpha<TSchema>,
	ahead: TreeViewAlpha<TSchema>,
): string {
	/**
	 * Gets the head commit of a view.
	 * Used for debugging and logging purposes only.
	 */
	const headFromView = (view: TreeViewAlpha<TSchema>): GraphCommit<unknown> => {
		// Commit information is not exposed through the public APIs,
		// so this diagnostic helper relies on implementation details.
		assert(
			view instanceof SchematizingSimpleTreeView,
			"Expected view to be a SchematizingSimpleTreeView",
		);
		return view.checkout.mainBranch.getHead();
	};
	const behindHead = headFromView(behind);
	const aheadHead = headFromView(ahead);
	const targetPath: GraphCommit<unknown>[] = [];
	const ancestor = findCommonAncestor(behindHead, [aheadHead, targetPath]);
	assert(ancestor !== undefined, "Branches do not share a common ancestor.");
	return `[${targetPath.map((commit) => commit.revision).join(", ")}]`;
}

/**
 * Synchronizes the Host's main branch with the Guest.
 * @remarks
 * This class owns branch synchronization only.
 * The `Host` owns transport encoding, message routing, and session lifetime.
 */
export class HostSynchronization<const TSchema extends ImplicitFieldSchema> {
	/**
	 * The local branch on the Host.
	 * It reflects the state of the Guest, but can lag because synchronization is asynchronous.
	 */
	public readonly local: TreeViewAlpha<TSchema>;
	/**
	 * The promise and resolver for the process of sending changes to the Guest.
	 * When this is defined, the Guest is behind the Host's main branch.
	 */
	private updateInProgress?: PromiseWithResolvers;
	/** A clone of the main branch from when the last update to the Guest started. */
	private mainHeadFromLastUpdate?: TreeViewAlpha<TSchema>;
	/** Whether the Host is applying changes from the Guest to the main branch. */
	private isApplyingGuestChanges: boolean = false;
	/** The callback that unsubscribes from main branch changes. */
	private readonly offMainChanged: () => void;
	private stopped = false;
	private disposed = false;

	public constructor(
		private readonly main: TreeViewAlpha<TSchema>,
		private readonly send: (message: DataChangeMessage | AcknowledgmentMessage) => void,
		private readonly bindHandles: (change: JsonCompatibleReadOnly) => void,
		private readonly run: (action: () => void) => void,
		private readonly fail: (error: unknown) => void,
		private readonly logger: (message: string) => void,
	) {
		this.local = main.fork();
		this.offMainChanged = this.main.events.on("changed", () => {
			// The Host might need to update the Guest after applying changes from the Guest,
			// but receiveChangeFromGuest must first send an acknowledgment to the Guest.
			this.run(() => {
				if (!this.isApplyingGuestChanges) {
					this.tryUpdateGuest("after main branch changed");
				}
			});
		});
	}

	/**
	 * Informs the Host of a new change made on the Guest.
	 * This method synchronously applies the change to the Host's local and main branches,
	 * then asynchronously attempts to update the Guest if necessary.
	 */
	public receiveChangeFromGuest(change: JsonCompatibleReadOnly): void {
		this.logger(`Host: received change [${getRevision(change)}] from Guest`);
		if (this.mainHeadFromLastUpdate !== undefined) {
			// The Guest authored this change before applying the update that is in progress.
			// That update does not account for the new change, so the Guest will reject it as
			// out of date. A new update based on the updated main head will replace it.
			this.logger(
				`Host:   abandoning update in progress for ${getMissingCommits(this.local, this.mainHeadFromLastUpdate)}`,
			);
			this.mainHeadFromLastUpdate.dispose();
			this.mainHeadFromLastUpdate = undefined;
		}
		this.local.applyChange(change);
		// applyChange runs the tree codec before handles are bound or the main branch is updated.
		this.bindHandles(change);
		this.logger(
			`Host:   merging changes from Guest: ${getMissingCommits(this.main, this.local)}`,
		);
		this.isApplyingGuestChanges = true;
		try {
			// TODO: Establish isolation for failures during main-tree merge, beyond validation on local.
			this.main.merge(this.local, false);
		} finally {
			this.isApplyingGuestChanges = false;
		}
		this.send({ type: "acknowledgment" });
		this.tryUpdateGuest("after receiving change from Guest");
	}

	/**
	 * Informs the Host that the Guest acknowledged a change that the Host sent.
	 */
	public receiveAckFromGuest(): void {
		if (this.mainHeadFromLastUpdate === undefined) {
			throw new SandboxProtocolError("Unexpectedly received ack from Guest");
		}
		assert(this.updateInProgress !== undefined, "Expected update to be in progress");
		this.logger(
			`Host: received ack of update from Guest for ${getMissingCommits(this.local, this.mainHeadFromLastUpdate)}`,
		);
		// Reflect the acknowledged update on the local branch.
		this.local.rebaseOnto(this.mainHeadFromLastUpdate);
		this.mainHeadFromLastUpdate.dispose();
		this.mainHeadFromLastUpdate = undefined;
		// Changes can arrive after an update is sent. Try again to make sure that the Guest is
		// fully up to date.
		this.tryUpdateGuest("after receiving ack of update");
	}

	/**
	 * Returns a promise that resolves when all changes known to the Host are reflected in the Guest,
	 * or undefined if all such changes are already reflected in the Guest.
	 */
	public get updateGuestPromise(): Promise<void> | undefined {
		return this.updateInProgress?.promise;
	}

	/** Stops synchronization and rejects pending work without disposing the branches. */
	public stop(error: Error): void {
		if (this.stopped) {
			return;
		}
		this.stopped = true;
		this.offMainChanged();
		this.updateInProgress?.rejecter(error);
		this.updateInProgress = undefined;
	}

	/** Releases branches owned by this synchronization state. */
	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.mainHeadFromLastUpdate?.dispose();
		this.mainHeadFromLastUpdate = undefined;
		this.local.dispose();
	}

	/**
	 * Attempts to send changes to the Guest if the Guest is behind the Host's main branch.
	 */
	private tryUpdateGuest(prompt: string): void {
		this.logger(`Host: considering sync ${prompt}...`);
		if (this.local.isMissingEditsFrom(this.main)) {
			this.logger(
				`Host:   detected changes that need to be reflected in Guest ${getMissingCommits(this.local, this.main)}`,
			);
			if (this.mainHeadFromLastUpdate !== undefined) {
				this.logger(
					"Host:   update already in progress. Will wait for it to complete or fail.",
				);
				return;
			}
			if (this.updateInProgress === undefined) {
				this.logger(
					"Host:   no pre-existing update in progress. Creating new update promise.",
				);
				this.updateInProgress = makePromiseWithResolvers();
				// Report through the session even when the application does not await synchronization.
				this.updateInProgress.promise.catch((error: unknown) => this.fail(error));
			} else {
				this.logger("Host:   Reusing existing update promise.");
			}
			this.mainHeadFromLastUpdate = this.main.fork();
			const update = this.local.computeNetChangeIfRebasedOnto(this.mainHeadFromLastUpdate);
			assert(
				update !== undefined,
				"Expected update to be defined since local is missing edits from main",
			);
			this.logger("Host:   sending update to Guest");
			this.send({
				type: "dataChange",
				change: update,
			});
		} else {
			this.logger("Host:   no changes that need to be reflected in Guest");
			if (this.updateInProgress !== undefined) {
				this.logger("Host:   resolving update promise");
				const resolver = this.updateInProgress.resolver;
				this.updateInProgress = undefined;
				resolver();
			}
		}
	}
}
