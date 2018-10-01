import * as map from "@prague/map";
import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";
import {
    CollaborativeStringExtension,
    SharedIntervalCollectionValueType,
    SharedStringIntervalCollectionValueType,
} from "@prague/shared-string";
import { StreamExtension } from "@prague/stream";
import * as assert from "assert";
import { EventEmitter } from "events";

/**
 * A document is a collection of collaborative types.
 */
export class Chaincode extends EventEmitter implements IChaincode {
    private modules = new Map<string, any>();

    /**
     * Constructs a new document from the provided details
     */
    constructor(private runner: { run: (document, platform) => Promise<IPlatform> }) {
        super();

        // Register default map value types
        map.registerDefaultValueType(new map.DistributedSetValueType());
        map.registerDefaultValueType(new map.CounterValueType());
        map.registerDefaultValueType(new SharedStringIntervalCollectionValueType());
        map.registerDefaultValueType(new SharedIntervalCollectionValueType());

        this.modules.set(map.MapExtension.Type, new map.MapExtension());
        this.modules.set(CollaborativeStringExtension.Type, new CollaborativeStringExtension());
        this.modules.set(StreamExtension.Type, new StreamExtension());
    }

    public getModule(type: string): any {
        assert(this.modules.has(type));
        return this.modules.get(type);
    }

    /**
     * Stops the instantiated chaincode from running
     */
    public close(): Promise<void> {
        return Promise.resolve();
    }

    public async run(runtime: IRuntime, platform: IPlatform): Promise<IPlatform> {
        return this.runner.run(runtime, platform);
    }
}
