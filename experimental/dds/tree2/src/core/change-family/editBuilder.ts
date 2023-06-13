/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AnchorSet } from "../tree";
import { ChangeFamily, ChangeFamilyEditor } from "./changeFamily";

export abstract class EditBuilder<TChange> implements ChangeFamilyEditor {
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
		this.changeFamily.rebaser.rebaseAnchors(this.anchorSet, change);
		this.changeReceiver(change);
	}

	public enterTransaction(): void {}
	public exitTransaction(): void {}
}
