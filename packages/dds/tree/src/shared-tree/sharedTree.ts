/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelAttributes, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { DefaultChangeSet, DefaultRebaser, ForestIndex } from "../feature-libraries";
import { SharedTreeCore } from "../shared-tree-core";

/**
 * Shared tree, configured with a good set of indexes and field kinds which will maintain compatibility over time.
 * TODO: node identifier index.
 *
 * TODO: detail compatibility requirements.
 */
export class SharedTree extends SharedTreeCore<DefaultRebaser> {
    public constructor(
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes,
        telemetryContextPrefix: string) {
            super(
                [new ForestIndex<DefaultChangeSet>()],
                new DefaultRebaser(), id, runtime, attributes, telemetryContextPrefix);
    }
}
