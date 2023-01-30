/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeRebaser } from "../rebase";
import { ReadonlyRepairDataStore } from "../repair";
import { AnchorSet, Delta } from "../tree";
import { ChangeEncoder } from "./changeEncoder";

export interface ChangeFamily<TEditor, TChange> {
	buildEditor(changeReceiver: (change: TChange) => void, anchorSet: AnchorSet): TEditor;

	/**
	 * @param change - The change to convert into a delta.
	 * @param repairStore - The store to query for repair data.
	 * If undefined, dummy data will be created instead.
	 */
	intoDelta(
		change: TChange,
		// TODO: make the repair store mandatory when all usages of this method have repair data support.
		repairStore?: ReadonlyRepairDataStore,
	): Delta.Root;

	readonly rebaser: ChangeRebaser<TChange>;
	readonly encoder: ChangeEncoder<TChange>;
}
