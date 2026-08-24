/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChangeFamilyEditor } from "../core/index.js";
import type { SharedTreeBranch } from "./branch.js";

/**
 * Answers queries about the branches.
 */
export interface BranchManager<
	TEditor extends ChangeFamilyEditor,
	TChange,
	TChangeProcessingContext,
> {
	/**
	 * Whether the given branch is persisted and shared with other clients.
	 * @param branch - The branch to check.
	 * @returns True if the branch is shared.
	 */
	isBranchShared(
		branch: SharedTreeBranch<TEditor, TChange, TChangeProcessingContext>,
	): boolean;
}

/**
 * A branch manager for a SharedTree that does not support shared branches.
 */
export class IndependentBranchManager<
	TEditor extends ChangeFamilyEditor,
	TChange,
	TChangeProcessingContext,
> implements BranchManager<TEditor, TChange, TChangeProcessingContext>
{
	public isBranchShared(
		_branch: SharedTreeBranch<TEditor, TChange, TChangeProcessingContext>,
	): boolean {
		return false;
	}
}
