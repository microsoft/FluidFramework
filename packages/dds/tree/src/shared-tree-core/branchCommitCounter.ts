/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import type { ChangeFamilyEditor, RevisionTag } from "../core/index.js";
import type { SharedTreeBranch, SharedTreeBranchChange } from "./branch.js";

/**
 * A utility class that counts the number of commits in a branch and keeps the count updated as the branch changes.
 *
 * @remarks
 * This class has no inside knowledge of what the commits represent.
 * It is therefore oblivious to any scheme where some root commit is considered "special" and should not be counted.
 */
export class BranchCommitCounter<
	TEditor extends ChangeFamilyEditor,
	TChange,
	TChangeProcessingContext,
> {
	private unsubscribeAfterChange?: () => void;
	private unsubscribeAncestryTrimmed?: () => void;
	private commitCountInitialized: boolean = false;
	private cachedCommitCount: number = 0;

	public constructor(
		private readonly branch: SharedTreeBranch<TEditor, TChange, TChangeProcessingContext>,
	) {}

	public dispose(): void {
		this.unsubscribeFromBranch();
	}

	/**
	 * Gets the number of commits in the branch.
	 */
	public get count(): number {
		if (!this.commitCountInitialized) {
			this.cachedCommitCount = this.branch.getCommitCount();
			this.subscribeToBranch();
			this.commitCountInitialized = true;
		}
		return this.cachedCommitCount;
	}

	private subscribeToBranch(): void {
		this.unsubscribeFromBranch();
		this.unsubscribeAfterChange = this.branch.events.on(
			"afterChange",
			this.onAfterBranchChange,
		);
		this.unsubscribeAncestryTrimmed = this.branch.events.on(
			"ancestryTrimmed",
			this.onAncestryTrimmed,
		);
	}

	private unsubscribeFromBranch(): void {
		this.unsubscribeAfterChange?.();
		this.unsubscribeAfterChange = undefined;
		this.unsubscribeAncestryTrimmed?.();
		this.unsubscribeAncestryTrimmed = undefined;
	}

	private readonly onAfterBranchChange = (event: SharedTreeBranchChange<TChange>): void => {
		if (!this.commitCountInitialized) {
			return;
		}

		switch (event.type) {
			case "append": {
				this.cachedCommitCount += event.newCommits.length;
				return;
			}
			case "remove": {
				this.cachedCommitCount -= event.removedCommits.length;
				return;
			}
			case "rebase": {
				this.cachedCommitCount += event.newCommits.length;
				this.cachedCommitCount -= event.removedCommits.length;
				return;
			}
			default: {
				unreachableCase(event);
			}
		}
	};

	private readonly onAncestryTrimmed = (trimmedRevisions: RevisionTag[]): void => {
		if (!this.commitCountInitialized) {
			return;
		}

		assert(
			this.cachedCommitCount >= trimmedRevisions.length,
			"Trimmed more commits than exist in the branch",
		);
		this.cachedCommitCount = this.cachedCommitCount - trimmedRevisions.length;
	};
}
