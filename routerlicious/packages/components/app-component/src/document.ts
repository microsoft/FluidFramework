import * as cell from "@prague/cell";
import {
    CounterValueType,
    DistributedSetValueType,
    ISharedMap,
    MapExtension,
    registerDefaultValueType,
} from "@prague/map";
import * as sequence from "@prague/sequence";
import * as stream from "@prague/stream";
import * as uuid from "uuid/v4";
import { Component } from "./component";

export class Document extends Component {
    constructor() {
        // Register default map value types
        registerDefaultValueType(new DistributedSetValueType());
        registerDefaultValueType(new CounterValueType());
        registerDefaultValueType(new sequence.SharedStringIntervalCollectionValueType());
        registerDefaultValueType(new sequence.SharedIntervalCollectionValueType());

        // Create channel extensions
        const mapExtension = new MapExtension();
        const sharedStringExtension = new sequence.SharedStringExtension();
        const streamExtension = new stream.StreamExtension();
        const cellExtension = new cell.CellExtension();
        const objectSequenceExtension = new sequence.SharedObjectSequenceExtension();
        const numberSequenceExtension = new sequence.SharedNumberSequenceExtension();

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
    public createMap(id: string = uuid()): ISharedMap {
        return this.runtime.createChannel(id, MapExtension.Type) as ISharedMap;
    }

    /**
     * Creates a new shared cell.
     */
    public createCell(id: string = uuid()): cell.ICell {
        return this.runtime.createChannel(id, cell.CellExtension.Type) as cell.ICell;
    }

    /**
     * Creates a new shared string
     */
    public createString(id: string = uuid()): sequence.SharedString {
        return this.runtime.createChannel(
            id,
            sequence.SharedStringExtension.Type) as sequence.SharedString;
    }

    /**
     * Creates a new ink shared object
     */
    public createStream(id: string = uuid()): stream.IStream {
        return this.runtime.createChannel(id, stream.StreamExtension.Type) as stream.IStream;
    }

    public async attach(): Promise<void> { /* do nothing */ }

    /**
     * Subclass implements 'create()' to put initial document structure in place.
     */
    protected async create(): Promise<void> { /* do nothing */ }
}
