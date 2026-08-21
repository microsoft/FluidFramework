/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";

import type { GraphCommit, RevisionTag } from "../core/index.js";
import type { SharedTreeBranch, SharedTreeBranchChange } from "../shared-tree-core/index.js";
import type { TreeBranchCommitMetadata, TreeBranchHistory } from "../simple-tree/index.js";

import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";

class LazyTreeBranchCommitMetadata implements TreeBranchCommitMetadata {
	public readonly revision: string;
	private parentCache?: {
		readonly prior: GraphCommit<SharedTreeChange>;
		readonly cached: TreeBranchCommitMetadata;
	};

	public constructor(
		private readonly commit: GraphCommit<SharedTreeChange>,
		private readonly idCompressor: IIdCompressor,
	) {
		assert(commit.revision !== "root", "Cannot construct metadata for the root commit");
		this.revision = idCompressor.decompress(commit.revision);
	}

	public get parent(): TreeBranchCommitMetadata | undefined {
		// The parent of the commit may change over time due to trunk trimming.
		if (this.commit.parent !== this.parentCache?.prior) {
			const { parent } = this.commit;
			this.parentCache =
				parent === undefined || parent.revision === "root"
					? undefined
					: {
							prior: parent,
							cached: new LazyTreeBranchCommitMetadata(parent, this.idCompressor),
						};
		}
		return this.parentCache?.cached;
	}
}

export class TreeBranchHistoryImpl implements TreeBranchHistory {
	private unsubscribeAfterChange?: () => void;
	private unsubscribeAncestryTrimmed?: () => void;
	private commitCountInitialized: boolean = false;
	private cachedCommitCount: number = 0;

	public constructor(
		private readonly branch: SharedTreeBranch<
			SharedTreeEditBuilder,
			SharedTreeChange,
			unknown
		>,
		private readonly idCompressor: IIdCompressor,
	) {}

	public dispose(): void {
		this.unsubscribeFromBranch();
	}

	public get commitCount(): number {
		if (!this.commitCountInitialized) {
			this.cachedCommitCount = this.countCommits();
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

	private countCommits(): number {
		const newHead = this.branch.getHead();
		let fullCommitCount = 0;
		for (
			let commit: GraphCommit<SharedTreeChange> | undefined = newHead;
			commit !== undefined && commit.revision !== "root";
			commit = commit.parent
		) {
			fullCommitCount++;
		}
		return fullCommitCount;
	}

	private readonly onAfterBranchChange = (
		event: SharedTreeBranchChange<SharedTreeChange>,
	): void => {
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

	public getHeadCommit(): TreeBranchCommitMetadata | undefined {
		const head = this.branch.getHead();
		if (head.revision === "root") {
			return undefined;
		}
		return new LazyTreeBranchCommitMetadata(head, this.idCompressor);
	}
}
