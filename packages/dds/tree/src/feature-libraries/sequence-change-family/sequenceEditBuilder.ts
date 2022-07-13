/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Delta, ProgressiveEditBuilder } from "../../changeset";
import { AnchorSet } from "../../tree";
import { sequenceChangeFamily } from "./sequenceChangeFamily";
import { SequenceChangeset } from "./sequenceChangeset";

export class SequenceEditBuilder extends ProgressiveEditBuilder<SequenceChangeset> {
    constructor(
        deltaReceiver: (delta: Delta) => void,
        anchorSet: AnchorSet,
    ) {
        super(sequenceChangeFamily, deltaReceiver, anchorSet);
    }

    public setValue(node: NodePath, value: Value) { }

    public insert(place: PlacePath, content: ProtoNode[]) { }

    public delete(place: PlacePath, count: number) { }

    public detach(place: PlacePath, count: number): MoveId {
        throw new Error("Not implemented.");
    }

    public attach(place: PlacePath, moveId: MoveId) { }

    public discard(moveId: MoveId) { }
}

interface NodePath { }
interface PlacePath { }
interface Value { }
interface ProtoNode { }
interface MoveId { }
