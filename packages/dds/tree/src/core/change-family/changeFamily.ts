/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeRebaser } from "../rebase";
import { AnchorSet, Delta } from "../tree";
import { ChangeEncoder } from "./changeEncoder";

/**
 * @alpha
 */
export interface ChangeFamily<TEditor, TChange> {
	buildEditor(changeReceiver: (change: TChange) => void, anchorSet: AnchorSet): TEditor;

	/**
	 * @param change - The change to convert into a delta.
	 */
	intoDelta(change: TChange): Delta.Root;

	readonly rebaser: ChangeRebaser<TChange>;
	readonly encoder: ChangeEncoder<TChange>;
}
