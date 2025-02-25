/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TaggedChange } from "../rebase/index.js";
import type { ChangeFamily, ChangeFamilyEditor } from "./changeFamily.js";

export abstract class EditBuilder<TChange> implements ChangeFamilyEditor {
	public constructor(
		protected readonly changeFamily: ChangeFamily<ChangeFamilyEditor, TChange>,
		private readonly changeReceiver: (change: TaggedChange<TChange>) => void,
	) {}

	/**
	 * Subclasses add editing methods which call this with their generated edits.
	 *
	 * @sealed
	 */
	protected applyChange(change: TaggedChange<TChange>): void {
		this.changeReceiver(change);
	}

	public enterTransaction(): void {}
	public exitTransaction(): void {}
}
