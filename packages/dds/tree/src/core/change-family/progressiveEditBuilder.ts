/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AnchorSet } from "../tree";
import { ChangeFamily } from "./changeFamily";

export interface ProgressiveEditBuilder<TChange> {
	/**
	 * @returns a copy of the internal change list so far.
	 */
	getChanges(): TChange[];
}

export abstract class ProgressiveEditBuilderBase<TChange>
	implements ProgressiveEditBuilder<TChange>
{
	private readonly changes: TChange[] = [];

	constructor(
		private readonly changeFamily: ChangeFamily<unknown, TChange>,
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
}
