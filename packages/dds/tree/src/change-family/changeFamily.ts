/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeRebaser } from "../rebase";
import { AnchorSet, Delta } from "../tree";
import { ChangeEncoder } from "./changeEncoder";

export interface ChangeFamily<TEditor, TChange> {
    buildEditor(deltaReceiver: (delta: Delta.Root) => void, anchorSet: AnchorSet): TEditor;
    intoDelta(change: TChange): Delta.Root;
    // TODO more specific types
    readonly rebaser: ChangeRebaser<TChange, TChange, TChange>;
    readonly encoder: ChangeEncoder<TChange>;
}
