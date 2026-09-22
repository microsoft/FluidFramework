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

/** Gets the revisions in the `ahead` view but not in the `behind` view. */
function getMissingCommits<TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema>(
	behind: TreeViewAlpha<TSchema>,
	ahead: TreeViewAlpha<TSchema>,
): string {
	const headFromView = (view: TreeViewAlpha<TSchema>): GraphCommit<unknown> => {
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

/** The SharedTree that connects to Fluid services on behalf of a Guest. */
export class Host<const TSchema extends ImplicitFieldSchema> {
	/** The main branch on the Host. Is automatically updated when peer changes are received. */
	public readonly main: TreeViewAlpha<TSchema>;
	/** The local branch on the Host. Always reflects the state of the Guest. */
	public readonly local: TreeViewAlpha<TSchema>;
	private updateInProgress?: PromiseWithResolver;
	private mainHeadFromLastUpdate?: TreeViewAlpha<TSchema>;
	private isApplyingGuestChanges: boolean = false;
	private readonly offMainChanged: () => void;

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

	private readonly onMessageError = (): void => {
		this.handleProtocolError(new Error("The Host could not deserialize a protocol message."));
	};

	public constructor(
		main: TreeViewAlpha<TSchema>,
		private readonly port: MessagePort,
		private readonly handleProtocolError: (error: Error) => void = throwProtocolError,
		private readonly logger: (message: string) => void = () => {},
	) {
		this.main = main;
		this.local = main.fork();
		this.offMainChanged = this.main.events.on("changed", () => {
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

	private receiveChangeFromGuest(change: JsonCompatibleReadOnly): void {
		this.logger(`Host: received change [${getRevision(change)}] from Guest`);
		if (this.mainHeadFromLastUpdate !== undefined) {
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
			if (this.updateInProgress !== undefined) {
				this.logger("Host:   resolving update promise");
				const resolver = this.updateInProgress.resolver;
				this.updateInProgress = undefined;
				resolver();
			}
		}
	}

	private receiveAckFromGuest(): void {
		assert(this.updateInProgress !== undefined, "Expected update to be in progress");
		assert(
			this.mainHeadFromLastUpdate !== undefined,
			"Expected main head from last update to be defined",
		);
		this.logger(
			`Host: received ack of update from Guest for ${getMissingCommits(this.local, this.mainHeadFromLastUpdate)}`,
		);
		this.local.rebaseOnto(this.mainHeadFromLastUpdate);
		this.mainHeadFromLastUpdate.dispose();
		this.mainHeadFromLastUpdate = undefined;
		this.tryUpdateGuest("after receiving ack of update");
	}

	/** Resolves when all Host changes have been reflected in the Guest. */
	public get updateGuestPromise(): Promise<void> | undefined {
		return this.updateInProgress?.promise;
	}
}
