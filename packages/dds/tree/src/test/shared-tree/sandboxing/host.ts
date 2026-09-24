/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert, fail } from "@fluidframework/core-utils/internal";

import { findCommonAncestor, type GraphCommit } from "../../../core/index.js";
import { SchematizingSimpleTreeView } from "../../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- The sandbox Host requires internal Simple Tree APIs.
import type { TreeViewAlpha } from "../../../simple-tree/api/index.js";
import type { ImplicitFieldSchema, UnsafeUnknownSchema } from "../../../simple-tree/index.js";
import type { JsonCompatibleReadOnly } from "../../../util/index.js";

import {
	type AcknowledgmentMessage,
	type BlobRequestMessage,
	type BlobResponseMessage,
	type DataChangeMessage,
	type HostGuestMessage,
	getRevision,
	makePromiseWithResolver,
	normalizeProtocolError,
	parseHostGuestMessage,
	type PromiseWithResolver,
	throwProtocolError,
} from "./common.js";
import { HostHandleCodec, normalizeTransportData } from "./handles.js";
import { SandboxSession } from "./session.js";

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
	public readonly codec: HostHandleCodec;
	private readonly session: SandboxSession;
	private disposed = false;
	/** Borrowed application view, updated by peer changes. Session teardown does not dispose it. */
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
		this.session.run(() => {
			const message = parseHostGuestMessage(this.codec.decode(event.data));
			switch (message.type) {
				case "dataChange": {
					this.receiveChangeFromGuest(message.change);
					break;
				}
				case "acknowledgment": {
					this.receiveAckFromGuest();
					break;
				}
				case "blobRequest": {
					this.receiveBlobRequest(message).catch((error: unknown) => {
						this.session.fail(error);
					});
					break;
				}
				case "blobResponse": {
					throw new Error("The Host cannot receive blob responses.");
				}
				case "sessionFailure": {
					this.session.fail(new Error(message.error), false);
					break;
				}
				default: {
					fail("Unexpected Host and Guest message type");
				}
			}
		});
	};

	/** Reports a protocol message that the platform cannot deserialize. */
	private readonly onMessageError = (): void => {
		this.session.fail(new Error("The Host could not deserialize a protocol message."));
	};

	public constructor(
		main: TreeViewAlpha<TSchema>,
		/** The Host endpoint of the Host and Guest message channel. */
		private readonly port: MessagePort,
		/** The SharedTree handle to which restored handles are bound. */
		bind: IFluidHandle,
		/** Reports terminal session failure asynchronously; the application must recreate the pair. */
		handleProtocolError: (error: Error) => void = throwProtocolError,
		/** Receives diagnostic messages from the synchronization algorithm. */
		private readonly logger: (message: string) => void = () => {},
	) {
		this.codec = new HostHandleCodec(bind);
		this.main = main;
		this.local = main.fork();
		this.session = new SandboxSession(
			port,
			(error) => {
				this.offMainChanged();
				this.codec.dispose();
				this.updateInProgress?.rejecter(error);
				this.updateInProgress = undefined;
			},
			handleProtocolError,
		);
		this.offMainChanged = this.main.events.on("changed", () => {
			// The Host might need to update the Guest after applying changes from the Guest,
			// but receiveChangeFromGuest must first send an acknowledgment to the Guest.
			this.session.run(() => {
				if (!this.isApplyingGuestChanges) {
					this.tryUpdateGuest("after main branch changed");
				}
			});
		});
		this.port.addEventListener("message", this.onMessage);
		this.port.addEventListener("messageerror", this.onMessageError);
		this.port.start();
	}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.session.dispose();
		this.port.removeEventListener("message", this.onMessage);
		this.port.removeEventListener("messageerror", this.onMessageError);
		this.mainHeadFromLastUpdate?.dispose();
		this.mainHeadFromLastUpdate = undefined;
		this.local.dispose();
	}

	/** Terminal failure requiring application-managed Host/Guest recreation, if this session failed. */
	public get error(): Error | undefined {
		return this.session.error;
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
		// applyChange runs the tree codec before handles are bound or the main branch is updated.
		this.codec.bindHandles(change);
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
		this.postMessage({ type: "acknowledgment" } satisfies AcknowledgmentMessage);
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
				// Report through the session even when the application does not await synchronization.
				this.updateInProgress.promise.catch((error: unknown) => this.session.fail(error));
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
			this.postMessage({
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

	private async receiveBlobRequest(message: BlobRequestMessage): Promise<void> {
		this.codec.validateToken(message.token);
		let response: BlobResponseMessage;
		try {
			const blob = await this.codec.resolveBlob(message.token);
			response = { type: "blobResponse", requestId: message.requestId, blob };
		} catch (error) {
			response = {
				type: "blobResponse",
				requestId: message.requestId,
				error: normalizeProtocolError(error).message,
			};
		}
		if (this.session.active) {
			// Do not transfer: detaching the Host's buffer could break other consumers.
			this.postMessage(response);
		}
	}

	private postMessage(message: HostGuestMessage): void {
		const normalized = normalizeTransportData(message);
		parseHostGuestMessage(normalized);
		this.port.postMessage(this.codec.encode(normalized));
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
	 * Pending promises reject on failure or disposal. Access after failure throws.
	 */
	public get updateGuestPromise(): Promise<void> | undefined {
		this.session.breaker.use();
		return this.updateInProgress?.promise;
	}
}
