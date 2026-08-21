/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";

import type { GraphCommit } from "../core/index.js";
import { BranchCommitCounter, type SharedTreeBranch } from "../shared-tree-core/index.js";
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
	private readonly commitCounter: BranchCommitCounter<
		SharedTreeEditBuilder,
		SharedTreeChange,
		unknown
	>;

	public constructor(
		private readonly branch: SharedTreeBranch<
			SharedTreeEditBuilder,
			SharedTreeChange,
			unknown
		>,
		private readonly idCompressor: IIdCompressor,
	) {
		this.commitCounter = new BranchCommitCounter(branch);
	}

	public dispose(): void {
		this.commitCounter.dispose();
	}

	public get commitCount(): number {
		// The commit count is the number of commits in the branch, excluding the root commit.
		return this.commitCounter.count - 1;
	}

	public getHeadCommit(): TreeBranchCommitMetadata | undefined {
		const head = this.branch.getHead();
		if (head.revision === "root") {
			return undefined;
		}
		return new LazyTreeBranchCommitMetadata(head, this.idCompressor);
	}
}
