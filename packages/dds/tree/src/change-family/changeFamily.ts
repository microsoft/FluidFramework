/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeRebaser } from "../rebase";
import { ReadonlyRepairDataStore, RepairDataStore } from "../repair";
import { AnchorSet, Delta } from "../tree";
import { ChangeEncoder } from "./changeEncoder";

export interface ChangeFamily<TEditor, TChange> {
    buildEditor(
        deltaReceiver: (delta: Delta.Root) => void,
        repairStore: RepairDataStore,
        anchorSet: AnchorSet,
    ): TEditor;
    intoDelta(
        change: TChange,
        // Allows undefined for now since we don't support it everywhere yet.
        // TODO: make the repair store mandatory when all usages of this method have repair data support.
        repairStore?: ReadonlyRepairDataStore,
    ): Delta.Root;
    readonly rebaser: ChangeRebaser<TChange>;
    readonly encoder: ChangeEncoder<TChange>;
}
