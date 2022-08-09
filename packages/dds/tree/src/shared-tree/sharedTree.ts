/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelAttributes, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import {
    DefaultChangeSet, DefaultRebaser, defaultSchemaPolicy, ForestIndex, ObjectForest, SchemaIndex,
} from "../feature-libraries";
import { StoredSchemaRepository } from "../schema-stored";
import { Index, SharedTreeCore } from "../shared-tree-core";
import { AnchorSet } from "../tree";

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
            const anchors = new AnchorSet();
            const schema = new StoredSchemaRepository(defaultSchemaPolicy);
            const forest = new ObjectForest(schema, anchors);
            const indexes: Index<DefaultChangeSet>[] = [
                new SchemaIndex(runtime, schema),
                new ForestIndex(runtime, forest),
            ];
            super(
                indexes,
                new DefaultRebaser(), anchors, id, runtime, attributes, telemetryContextPrefix,
                );

            // Could save a reference to this to allow use as part of a default checkout.
            // this.forest = forest;
    }
}
