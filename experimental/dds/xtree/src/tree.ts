/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidSerializer } from "@fluidframework/core-interfaces";
import {
    ISequencedDocumentMessage,
    ITree,
} from "@fluidframework/protocol-definitions";
import {
    IFluidDataStoreRuntime,
    IChannelStorageService,
    IChannelAttributes,
} from "@fluidframework/datastore-definitions";
import {
    SharedObject,
} from "@fluidframework/shared-object-base";
import { SharedXTreeFactory } from "./runtime";

export class SharedXTree extends SharedObject
{
    public static getFactory() { return new SharedXTreeFactory(); }

    constructor(runtime: IFluidDataStoreRuntime, public id: string, attributes: IChannelAttributes) {
        super(id, runtime, attributes);
    }

    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
     */
    public static create(runtime: IFluidDataStoreRuntime, id?: string) {
        return runtime.createChannel(id, SharedXTreeFactory.Type) as SharedXTree;
    }

    protected snapshotCore(serializer: IFluidSerializer): ITree {
        throw new Error("not implemented");
    }

    protected didAttach() {  }

    protected onConnect() {  }

    protected resubmitCore(content: any, localOpMetadata: unknown) { throw new Error("not implemented"); }

    protected onDisconnect() {}

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
     */
    protected async loadCore(storage: IChannelStorageService) { throw new Error("not implemented"); }

    protected processCore(rawMessage: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        // const msg = parseHandles(rawMessage, this.serializer);
        // const contents = msg.contents;

        throw new Error("not implemented");
    }

    protected registerCore() { throw new Error("not implemented"); }

    protected applyStashedOp() { throw new Error("not implemented"); }
}
