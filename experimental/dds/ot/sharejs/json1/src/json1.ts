/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelAttributes, IFluidDataStoreRuntime, Serializable } from "@fluidframework/datastore-definitions";
import { SharedOT } from "@fluid-experimental/ot";
import { Doc, type as Json1OTType, JSONOp, replaceOp, insertOp, moveOp, removeOp, Path } from "ot-json1";
import { Json1Factory } from "./factory";

export class SharedJson1 extends SharedOT<Doc, JSONOp> {
    public static create(runtime: IFluidDataStoreRuntime, id?: string): SharedJson1 {
        return runtime.createChannel(id, Json1Factory.Type) as SharedJson1;
    }

    public static getFactory() { return new Json1Factory(); }

    constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
        // RATIONALE: 'undefined' is not preserved by JSON.stringify().
        // eslint-disable-next-line no-null/no-null
        super(id, runtime, attributes, /* initialValue: */ null);
    }

    public get(): Doc { return this.state; }

    public apply(op: JSONOp) { super.apply(op); }

    protected transform(input: JSONOp, transform: JSONOp): JSONOp {
        return Json1OTType.transformNoConflict(input, transform, "left");
    }

    protected applyCore(state: Doc, op: JSONOp) {
        return Json1OTType.apply(state, op) as Doc;
    }

    public insert(path: Path, value: Serializable) {
        this.apply(insertOp(path, value as Doc));
    }

    public move(from: Path, to: Path) {
        this.apply(moveOp(from, to));
    }

    public remove(path: Path, value?: boolean) {
        this.apply(removeOp(path, value));
    }

    public replace(path: Path, oldValue: Serializable, newValue: Serializable) {
        this.apply(replaceOp(path, oldValue as Doc, newValue as Doc));
    }
}
