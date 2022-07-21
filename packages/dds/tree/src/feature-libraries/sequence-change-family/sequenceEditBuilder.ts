/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ProgressiveEditBuilder } from "../../change-family";
import { Delta } from "../../changeset";
import { ITreeCursor } from "../../forest";
import { AnchorSet, UpPath, Value } from "../../tree";
import { sequenceChangeFamily } from "./sequenceChangeFamily";
import { SequenceChangeset } from "./sequenceChangeset";

export class SequenceEditBuilder extends ProgressiveEditBuilder<SequenceChangeset> {
    constructor(
        deltaReceiver: (delta: Delta.Root) => void,
        anchorSet: AnchorSet,
    ) {
        super(sequenceChangeFamily, deltaReceiver, anchorSet);
    }

    public setValue(node: NodePath, value: Value) { }

    public insert(place: PlacePath, content: ITreeCursor) { }

    public delete(place: PlacePath, count: number) { }

    public move(source: PlacePath, count: number, destination: PlacePath) { }
}

type NodePath = UpPath;
type PlacePath = UpPath;
