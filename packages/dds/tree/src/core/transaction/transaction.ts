/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEditableForest } from "../forest";
import { ChangeFamily } from "../change-family";
import { RevisionTag } from "../rebase";

/**
 * The interface a checkout has to implement for a transaction to be able to be applied to it.
 */
export interface Checkout<TEditor, TChange> {
	readonly forest: IEditableForest;
	readonly changeFamily: ChangeFamily<TEditor, TChange>;
	mintRevision: () => RevisionTag;
	submitEdit(edit: TChange): void;
}
