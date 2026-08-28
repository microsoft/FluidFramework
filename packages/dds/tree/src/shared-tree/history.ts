/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";

import type { GraphCommit, CustomMetadataTree } from "../core/index.js";
import { flattenCustomMetadata } from "../core/index.js";
import { BranchCommitCounter, type SharedTreeBranch } from "../shared-tree-core/index.js";
import type { TreeBranchCommitMetadata, TreeBranchHistory } from "../simple-tree/index.js";
import type { JsonCompatibleReadOnlyObject } from "../util/index.js";

import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";

/**
 * A lazily constructed implementation of {@link TreeBranchCommitMetadata} that wraps a {@link GraphCommit}.
 */
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
		assert(
			commit.revision !== "root",
			0xd34 /* Cannot construct metadata for the root commit */,
		);
		this.revision = idCompressor.decompress(commit.revision);
	}

	public get custom(): JsonCompatibleReadOnlyObject | undefined {
		return flattenCustomMetadata(this.commit.customMetadata);
	}

	public get customTree(): CustomMetadataTree | undefined {
		return this.commit.customMetadata;
	}

	public getParent(): TreeBranchCommitMetadata | undefined {
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

/**
 * A default implementation of {@link TreeBranchHistory} that wraps a {@link SharedTreeBranch}.
 */
export class DefaultTreeBranchHistory implements TreeBranchHistory {
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

	public get length(): number {
		return this.commitCounter.count;
	}

	public getHead(): TreeBranchCommitMetadata | undefined {
		const head = this.branch.getHead();
		if (head.revision === "root") {
			return undefined;
		}
		return new LazyTreeBranchCommitMetadata(head, this.idCompressor);
	}
}
