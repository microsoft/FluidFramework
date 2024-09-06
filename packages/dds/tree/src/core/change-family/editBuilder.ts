/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { tagChange, type RevisionTag, type TaggedChange } from "../rebase/index.js";
import type { ChangeFamily, ChangeFamilyEditor } from "./changeFamily.js";

export abstract class EditBuilder<TChange> implements ChangeFamilyEditor {
	public constructor(
		protected readonly changeFamily: ChangeFamily<ChangeFamilyEditor, TChange>,
		private readonly mintRevisionTag: () => RevisionTag,
		private readonly changeReceiver: (change: TaggedChange<TChange>) => void,
	) {}

	/**
	 * Subclasses add editing methods which call this with their generated edits.
	 *
	 * @sealed
	 */
	protected applyChange(change: TChange): void {
		this.changeReceiver(tagChange(change, this.mintRevisionTag()));
	}

	public enterTransaction(): void {}
	public exitTransaction(): void {}
}
