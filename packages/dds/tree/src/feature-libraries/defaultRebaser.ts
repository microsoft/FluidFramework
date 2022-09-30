/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AnchorSet, Delta, UpPath, Value } from "../tree";
import { ChangeRebaser } from "../rebase";
import { Contravariant, Covariant, Invariant, JsonCompatible } from "../util";
import { ChangeEncoder, ChangeFamily } from "../change-family";

export class DefaultChangeFamily implements ChangeFamily<DefaultEditor, DefaultChangeset> {
    readonly encoder = defaultChangeEncoder;
    readonly rebaser = new DefaultRebaser();

    buildEditor(deltaReceiver: (delta: Delta.Root) => void, anchorSet: AnchorSet): DefaultEditor {
        throw new Error("Method not implemented.");
    }
    intoDelta(change: DefaultChangeset): Delta.Root {
        throw new Error("Method not implemented.");
    }
    pack(change: DefaultChangeset) {
        throw new Error("Method not implemented.");
    }
    unpack(data: any): DefaultChangeset {
        throw new Error("Method not implemented.");
    }
}

// TODO: factor actual changeset logic out by field kind, and into some other directory.

// TODO: implement
export class DefaultRebaser implements ChangeRebaser<DefaultChangeset> {
    rebaseAnchors(anchor: AnchorSet, over: DefaultChangeset): void {
        throw new Error("Method not implemented.");
    }
    _typeCheck?: Covariant<DefaultChangeset> & Contravariant<DefaultChangeset> & Invariant<DefaultChangeset>;
    compose(changes: DefaultChangeset[]): DefaultChangeset {
        throw new Error("Method not implemented.");
    }
    invert(changes: DefaultChangeset): DefaultChangeset {
        throw new Error("Method not implemented.");
    }
    rebase(change: DefaultChangeset, over: DefaultChangeset): DefaultChangeset {
        throw new Error("Method not implemented.");
    }

    // TODO: us putting editing functions here enough, or do we need some other way to expose them?
    setValue(path: UpPath, value: Value): DefaultChangeset {
        return new DefaultChangeset([new SetValue(path, value)]);
    }
}

class DefaultChangeEncoder extends ChangeEncoder<DefaultChangeset> {
    public encodeForJson(formatVersion: number, change: DefaultChangeset): JsonCompatible {
        throw new Error("Method not implemented.");
    }
    public decodeJson(formatVersion: number, change: JsonCompatible): DefaultChangeset {
        throw new Error("Method not implemented.");
    }
}

const defaultChangeEncoder: ChangeEncoder<DefaultChangeset> = new DefaultChangeEncoder();

export interface DefaultEditor {}

// A super basic placeholder for a real changeset type.
// TODO: move this to be a test changeset type (in test directory) and replace with something with good features.

export class DefaultChangeset {
    public constructor(public readonly changes: readonly Change[]) {}
}

export abstract class Change {
    public constructor(public readonly path: UpPath) {}
}

export class SetValue extends Change {
    public constructor(path: UpPath, public readonly value: Value) { super(path); }
}
