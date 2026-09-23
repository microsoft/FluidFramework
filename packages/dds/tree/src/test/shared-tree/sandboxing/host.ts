/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";

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
	makePromiseWithResolver,
	normalizeProtocolError,
	parseHostGuestMessage,
	type PromiseWithResolver,
	throwProtocolError,
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
 * The SharedTree that connects to Fluid services on behalf of a Guest.
 *
 * @typeParam TSchema - The schema of the synchronized tree.
 */
export class Host<const TSchema extends ImplicitFieldSchema> {
	/** The main branch on the Host. Is automatically updated when peer changes are received. */
	public readonly main: TreeViewAlpha<TSchema>;
	/**
	 * The local branch on the Host.
	 * It reflects the state of the Guest, but can lag because synchronization is asynchronous.
	 */
	public readonly local: TreeViewAlpha<TSchema>;
	/**
	 * The promise and resolver for the process of sending changes to the Guest.
	 * When this is defined, the Guest is behind the Host's main branch.
	 * The promise resolves when the Guest catches up with the Host's main branch.
	 * When this is undefined, no update is in progress and the Guest is up to date with the
	 * Host's main branch.
	 */
	private updateInProgress?: PromiseWithResolver;
	/** A clone of the main branch from when the last update to the Guest started. */
	private mainHeadFromLastUpdate?: TreeViewAlpha<TSchema>;
	/** Whether the Host is applying changes from the Guest to the main branch. */
	private isApplyingGuestChanges: boolean = false;
	/** The callback that unsubscribes from main branch changes. */
	private readonly offMainChanged: () => void;

	/** Receives and routes protocol messages from the Guest. */
	private readonly onMessage = (event: MessageEvent<unknown>): void => {
		try {
			const message = parseHostGuestMessage(event.data);
			switch (message.type) {
				case "dataChange": {
					this.receiveChangeFromGuest(message.change);
					break;
				}
				case "acknowledgment": {
					this.receiveAckFromGuest();
					break;
				}
				default: {
					fail("Unexpected Host and Guest message type");
				}
			}
		} catch (error) {
			this.handleProtocolError(normalizeProtocolError(error));
		}
	};

	/** Reports a protocol message that the platform cannot deserialize. */
	private readonly onMessageError = (): void => {
		this.handleProtocolError(new Error("The Host could not deserialize a protocol message."));
	};

	public constructor(
		main: TreeViewAlpha<TSchema>,
		/** The Host endpoint of the Host and Guest message channel. */
		private readonly port: MessagePort,
		/** Receives errors from protocol validation and message processing. */
		private readonly handleProtocolError: (error: Error) => void = throwProtocolError,
		/** Receives diagnostic messages from the synchronization algorithm. */
		private readonly logger: (message: string) => void = () => {},
	) {
		this.main = main;
		this.local = main.fork();
		this.offMainChanged = this.main.events.on("changed", () => {
			// The Host might need to update the Guest after applying changes from the Guest,
			// but receiveChangeFromGuest must first send an acknowledgment to the Guest.
			if (!this.isApplyingGuestChanges) {
				this.tryUpdateGuest("after main branch changed");
			}
		});
		this.port.addEventListener("message", this.onMessage);
		this.port.addEventListener("messageerror", this.onMessageError);
		this.port.start();
	}

	public dispose(): void {
		this.port.removeEventListener("message", this.onMessage);
		this.port.removeEventListener("messageerror", this.onMessageError);
		this.port.close();
		this.updateInProgress = undefined;
		this.offMainChanged();
		this.mainHeadFromLastUpdate?.dispose();
		this.mainHeadFromLastUpdate = undefined;
		this.local.dispose();
		this.main.dispose();
	}

	/**
	 * Informs the Host of a new change made on the Guest.
	 * This method synchronously applies the change to the Host's local and main branches,
	 * then asynchronously attempts to update the Guest if necessary.
	 */
	private receiveChangeFromGuest(change: JsonCompatibleReadOnly): void {
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
		this.logger(
			`Host:   merging changes from Guest: ${getMissingCommits(this.main, this.local)}`,
		);
		this.isApplyingGuestChanges = true;
		try {
			this.main.merge(this.local, false);
		} finally {
			this.isApplyingGuestChanges = false;
		}
		this.port.postMessage({ type: "acknowledgment" } satisfies AcknowledgmentMessage);
		this.tryUpdateGuest("after receiving change from Guest");
	}

	/**
	 * Attempts to send changes to the Guest if the Guest is behind the Host's main branch.
	 * If the Guest is already up to date, no update is sent and any pending synchronization promise is resolved and cleared.
	 * If an update is awaiting acknowledgment, no additional update is sent.
	 *
	 * @remarks
	 * Updating the Guest is asynchronous, so the Guest can still be behind the Host's main branch
	 * after this method returns.
	 * See {@link updateGuestPromise} for a promise that resolves when the Guest is fully up to date.
	 *
	 * @param prompt - Text for the log message that explains why an update is being considered.
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
				this.updateInProgress = makePromiseWithResolver();
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
			this.port.postMessage({
				type: "dataChange",
				change: update,
			} satisfies DataChangeMessage);
		} else {
			this.logger("Host:   no changes that need to be reflected in Guest");
			// The Guest is now caught up with the Host's main branch.
			if (this.updateInProgress !== undefined) {
				this.logger("Host:   resolving update promise");
				const resolver = this.updateInProgress.resolver;
				this.updateInProgress = undefined;
				resolver();
			}
		}
	}

	/**
	 * Informs the Host that the Guest acknowledged a change that the Host sent.
	 * This lets the Host reflect the acknowledged change on the local branch.
	 * It can also cause the Host to send changes that arrived after the acknowledged update.
	 */
	private receiveAckFromGuest(): void {
		assert(this.updateInProgress !== undefined, "Expected update to be in progress");
		assert(
			this.mainHeadFromLastUpdate !== undefined,
			"Expected main head from last update to be defined",
		);
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
	 *
	 * If new changes arrive while a promise is in progress, the existing promise resolves only
	 * after the new changes are also reflected in the Guest.
	 * A caller does not need to get the promise again after new changes arrive while it is pending.
	 */
	public get updateGuestPromise(): Promise<void> | undefined {
		return this.updateInProgress?.promise;
	}
}
