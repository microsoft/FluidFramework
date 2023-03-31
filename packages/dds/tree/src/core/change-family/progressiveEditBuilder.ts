/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AnchorSet } from "../tree";
import { ChangeFamily, ChangeFamilyEditor } from "./changeFamily";

/**
 * @alpha
 */
export interface ProgressiveEditBuilder<TChange> {
	/**
	 * @returns a copy of the internal change list so far.
	 */
	getChanges(): TChange[];
}

/**
 * @alpha
 */
export abstract class ProgressiveEditBuilderBase<TChange>
	implements ProgressiveEditBuilder<TChange>, ChangeFamilyEditor
{
	private readonly changes: TChange[] = [];

	public constructor(
		protected readonly changeFamily: ChangeFamily<ChangeFamilyEditor, TChange>,
		private readonly changeReceiver: (change: TChange) => void,
		private readonly anchorSet: AnchorSet,
	) {}

	/**
	 * Subclasses add editing methods which call this with their generated edits.
	 *
	 * @sealed
	 */
	protected applyChange(change: TChange): void {
		this.changes.push(change);
		this.changeFamily.rebaser.rebaseAnchors(this.anchorSet, change);
		this.changeReceiver(change);
	}

	/**
	 * {@inheritDoc (ProgressiveEditBuilder:interface).getChanges}
	 * @sealed
	 */
	public getChanges(): TChange[] {
		return [...this.changes];
	}

	public enterTransaction(): void {}
	public exitTransaction(): void {}
}
