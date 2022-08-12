/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AnchorSet, Delta, UpPath, Value } from "../tree";
import { ChangeRebaser } from "../rebase";
import { Contravariant, Covariant, Invariant } from "../util";
import { ChangeEncoder, ChangeFamily, JsonCompatible } from "../change-family";

export class DefaultChangeFamily implements ChangeFamily<DefaultEditor, DefaultChangeSet> {
    readonly encoder = defaultChangeEncoder;
    readonly rebaser = new DefaultRebaser();

    buildEditor(deltaReceiver: (delta: Delta.Root) => void, anchorSet: AnchorSet): DefaultEditor {
        throw new Error("Method not implemented.");
    }
    intoDelta(change: DefaultChangeSet): Delta.Root {
        throw new Error("Method not implemented.");
    }
    pack(change: DefaultChangeSet) {
        throw new Error("Method not implemented.");
    }
    unpack(data: any): DefaultChangeSet {
        throw new Error("Method not implemented.");
    }
}

// TODO: factor actual changeset logic out by field kind, and into some other directory.

// TODO: implement
export class DefaultRebaser implements ChangeRebaser<DefaultChangeSet> {
    rebaseAnchors(anchor: AnchorSet, over: DefaultChangeSet): void {
        throw new Error("Method not implemented.");
    }
    _typeCheck?: Covariant<DefaultChangeSet> & Contravariant<DefaultChangeSet> & Invariant<DefaultChangeSet>;
    compose(changes: DefaultChangeSet[]): DefaultChangeSet {
        throw new Error("Method not implemented.");
    }
    invert(changes: DefaultChangeSet): DefaultChangeSet {
        throw new Error("Method not implemented.");
    }
    rebase(change: DefaultChangeSet, over: DefaultChangeSet): DefaultChangeSet {
        throw new Error("Method not implemented.");
    }

    // TODO: us putting editing functions here enough, or do we need some other way to expose them?
    setValue(path: UpPath, value: Value): DefaultChangeSet {
        return new DefaultChangeSet([new SetValue(path, value)]);
    }
}

class DefaultChangeEncoder extends ChangeEncoder<DefaultChangeSet> {
    public encodeForJson(formatVersion: number, change: DefaultChangeSet): JsonCompatible {
        throw new Error("Method not implemented.");
    }
    public decodeJson(formatVersion: number, change: JsonCompatible): DefaultChangeSet {
        throw new Error("Method not implemented.");
    }
}

const defaultChangeEncoder: ChangeEncoder<DefaultChangeSet> = new DefaultChangeEncoder();

export interface DefaultEditor {}

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
