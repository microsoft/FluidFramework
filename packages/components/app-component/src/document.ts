/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as cell from "@prague/cell";
import {
    CounterValueType,
    DistributedSetValueType,
    ISharedMap,
    registerDefaultValueType,
    SharedMap,
} from "@prague/map";
import * as sequence from "@prague/sequence";
import * as stream from "@prague/stream";
import { Component } from "./component";

export abstract class Document extends Component {
    constructor() {
        // Register default map value types
        registerDefaultValueType(new DistributedSetValueType());
        registerDefaultValueType(new CounterValueType());
        registerDefaultValueType(new sequence.SharedStringIntervalCollectionValueType());
        registerDefaultValueType(new sequence.SharedIntervalCollectionValueType());

        // Create channel extensions
        const mapExtension = SharedMap.getFactory();
        const sharedStringExtension = sequence.SharedString.getFactory();
        const streamExtension = stream.Stream.getFactory();
        const cellExtension = cell.Cell.getFactory();
        const objectSequenceExtension = sequence.SharedObjectSequence.getFactory();
        const numberSequenceExtension = sequence.SharedNumberSequence.getFactory();

        // Register channel extensions
        super([
            [mapExtension.type, mapExtension],
            [sharedStringExtension.type, sharedStringExtension],
            [streamExtension.type, streamExtension],
            [cellExtension.type, cellExtension],
            [objectSequenceExtension.type, objectSequenceExtension],
            [numberSequenceExtension.type, numberSequenceExtension],
        ]);
    }

    /**
     * Subclass implements 'opened()' to finish initialization after the component has been opened/created.
     */
    public opened(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Creates a new shared map
     */
    public createMap(id?: string): ISharedMap {
        return SharedMap.create(this.runtime, id);
    }

    /**
     * Creates a new shared cell.
     */
    public createCell(id?: string): cell.ICell {
        return cell.Cell.create(this.runtime, id);
    }

    /**
     * Creates a new shared string
     */
    public createString(id?: string): sequence.SharedString {
        return sequence.SharedString.create(this.runtime, id);
    }

    /**
     * Creates a new ink shared object
     */
    public createStream(id?: string): stream.IStream {
        return stream.Stream.create(this.runtime, id);
    }
}
