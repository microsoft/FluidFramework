/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidSerializer } from "@fluidframework/core-interfaces";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { ITree } from "@fluidframework/protocol-definitions";
import { convertToSummaryTreeWithStats } from "@fluidframework/runtime-utils";
import { ISharedObjectSnaphost, SharedObjectBase } from "./sharedObjectBase";
import { ISharedObjectEvents } from "./types";

/**
 *  Base class for shared objects with synchronous summarization
 */
export abstract class SharedObject<TEvent extends ISharedObjectEvents = ISharedObjectEvents>
    extends SharedObjectBase<TEvent> {
    /**
     * @param id - The id of the shared object
     * @param runtime - The IFluidDataStoreRuntime which contains the shared object
     * @param attributes - Attributes of the shared object
     */
    constructor(
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes)
    {
        super(id, runtime, attributes);
    }

    protected captureStateCore(): ISharedObjectSnaphost {
        const snapshot = this.snapshotCore(this.serializer);
        return { summarize: async (serializer: IFluidSerializer, fullTree: boolean = false) => {
            return convertToSummaryTreeWithStats(snapshot, fullTree);
        }};
    }

    /**
     * Gets a form of the object that can be serialized.
     * Note that serialization can be slow, in which case consider deriving directly from SharedObjectBase to
     * implement captureStateCore and serializing asynchronously.
     * @returns A tree representing the summary of the shared object.
     */
    protected abstract snapshotCore(serializer: IFluidSerializer): ITree;
}
