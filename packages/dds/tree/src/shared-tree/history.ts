/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IIdCompressor, SessionSpaceCompressedId } from "@fluidframework/id-compressor";

import type { GraphCommit, CustomMetadataTree } from "../core/index.js";
import { flattenCustomMetadata } from "../core/index.js";
import { BranchCommitCounter, type SharedTreeBranch } from "../shared-tree-core/index.js";
import type {
	CommitRevision,
	TreeBranchCommitMetadata,
	TreeBranchHistory,
} from "../simple-tree/index.js";
import type { JsonCompatibleReadOnlyObject } from "../util/index.js";

import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";

/**
 * A lazily constructed implementation of {@link TreeBranchCommitMetadata} that wraps a {@link GraphCommit}.
 */
class LazyTreeBranchCommitMetadata implements TreeBranchCommitMetadata {
	/**
	 * Holds a copy of data that may become inaccessible when the commit is trimmed.
	 */
	private readonly snapshot: {
		readonly revision: SessionSpaceCompressedId;
		readonly parent: GraphCommit<SharedTreeChange> | undefined;
		readonly customMetadata: CustomMetadataTree | undefined;
	};
	private parentCache?: {
		readonly prior: GraphCommit<SharedTreeChange> | undefined;
		readonly cached: TreeBranchCommitMetadata | undefined;
	};

	public constructor(
		private readonly commit: GraphCommit<SharedTreeChange>,
		private readonly idCompressor: IIdCompressor,
	) {
		assert(commit.revision !== "root", "Cannot construct metadata for the root commit");
		this.snapshot = {
			revision: commit.revision,
			parent: commit.parent,
			customMetadata: commit.customMetadata,
		};
	}

	public get revision(): CommitRevision {
		return this.idCompressor.decompress(this.snapshot.revision);
	}

	public get custom(): JsonCompatibleReadOnlyObject | undefined {
		return flattenCustomMetadata(this.snapshot.customMetadata);
	}

	public get customTree(): CustomMetadataTree | undefined {
		return this.snapshot.customMetadata;
	}

	public getParent(): TreeBranchCommitMetadata | undefined {
		if (this.commit.wasTrimmed) {
			delete this.parentCache;
			return undefined;
		}
		const parent = this.snapshot.parent;
		if (parent !== this.parentCache?.prior) {
			this.parentCache = {
				prior: parent,
				cached:
					parent === undefined || parent.wasTrimmed
						? undefined
						: new LazyTreeBranchCommitMetadata(parent, this.idCompressor),
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
