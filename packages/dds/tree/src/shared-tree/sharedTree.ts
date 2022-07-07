/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Value } from "../forest";
import { ChangeRebaser, UpPath } from "../rebase";
import { SharedTreeCore } from "../shared-tree-core";
import { Covariant, Contravariant, Invariant } from "../util";

/**
 * Shared tree, configured with a good set of indexes and field kinds which will maintain compatibility over time.
 *
 * TODO: details compatibility requirements.
 *
 * TODO: actually implement
 */
export class SharedTree extends SharedTreeCore<DefaultRebaser> {

}

// TODO: factor actual changeset logic out by field kind, and into some other directory.

// TODO: implement
class DefaultRebaser implements ChangeRebaser<DefaultChangeSet, DefaultChangeSet, DefaultChangeSet> {
    _typeCheck?: Covariant<DefaultChangeSet> & Contravariant<DefaultChangeSet> & Invariant<DefaultChangeSet>;
    compose(...changes: DefaultChangeSet[]): DefaultChangeSet {
        throw new Error("Method not implemented.");
    }
    invert(changes: DefaultChangeSet): DefaultChangeSet {
        throw new Error("Method not implemented.");
    }
    rebase(change: DefaultChangeSet, over: DefaultChangeSet): DefaultChangeSet {
        throw new Error("Method not implemented.");
    }
    import(change: DefaultChangeSet): DefaultChangeSet {
        throw new Error("Method not implemented.");
    }
    export(change: DefaultChangeSet): DefaultChangeSet {
        throw new Error("Method not implemented.");
    }

    // TODO: us putting editing functions here enough, or do we need some other way to expose them?
    setValue(path: UpPath, value: Value): DefaultChangeSet {
        return new DefaultChangeSet([new SetValue(path, value)]);
    }
}

// A super basic placeholder for a real changeset type.
// TODO: move this to be a test changeset type (in test directory) and replace with something with good features.

export class DefaultChangeSet {
    public constructor(public readonly changes: readonly Change[]) {}
}

export abstract class Change {
    public constructor(public readonly path: UpPath) {}
}

export class SetValue extends Change {
    public constructor(path: UpPath, public readonly value: Value) { super(path); }
}
