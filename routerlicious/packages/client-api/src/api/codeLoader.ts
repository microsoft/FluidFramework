import * as cell from "@prague/cell";
import * as map from "@prague/map";
import {
    IChaincode,
    IChaincodeFactory,
    ICodeLoader,
    IPlatform,
    IRuntime,
} from "@prague/runtime-definitions";
import * as sequence from "@prague/sequence";
import * as stream from "@prague/stream";

export class Chaincode implements IChaincode {
    private modules = new Map<string, any>();

    constructor(private runFn: (runtime: IRuntime, platform: IPlatform) => Promise<IPlatform>) {
        // Register default map value types
        map.registerDefaultValueType(new map.DistributedSetValueType());
        map.registerDefaultValueType(new map.CounterValueType());
        map.registerDefaultValueType(new sequence.SharedStringIntervalCollectionValueType());
        map.registerDefaultValueType(new sequence.SharedIntervalCollectionValueType());

        // Create channel extensions
        const mapExtension = new map.MapExtension();
        const sharedStringExtension = new sequence.CollaborativeStringExtension();
        const streamExtension = new stream.StreamExtension();
        const cellExtension = new cell.CellExtension();
        const objectSequenceExtension = new sequence.CollaborativeObjectSequenceExtension();
        const numberSequenceExtension = new sequence.CollaborativeNumberSequenceExtension();

        // Register channel extensions
        this.modules.set(mapExtension.type, mapExtension);
        this.modules.set(sharedStringExtension.type, sharedStringExtension);
        this.modules.set(streamExtension.type, streamExtension);
        this.modules.set(cellExtension.type, cellExtension);
        this.modules.set(objectSequenceExtension.type, objectSequenceExtension);
        this.modules.set(numberSequenceExtension.type, numberSequenceExtension);
    }

    public getModule(type: string): any {
        return this.modules.get(type);
    }

    /* tslint:disable:promise-function-async */
    public close(): Promise<void> {
        return Promise.resolve();
    }

    public run(runtime: IRuntime, platform: IPlatform): Promise<IPlatform> {
        return this.runFn(runtime, platform);
    }
}

export class ChaincodeFactory implements IChaincodeFactory {
    constructor(private runFn: (runtime: IRuntime, platform: IPlatform) => Promise<IPlatform>) {
    }

    public instantiate(): Promise<IChaincode> {
        const chaincode = new Chaincode(this.runFn);
        return Promise.resolve(chaincode);
    }
}

export class CodeLoader implements ICodeLoader {
    private factory: IChaincodeFactory;

    constructor(runFn: (runtime: IRuntime, platform: IPlatform) => Promise<IPlatform>) {
        this.factory = new ChaincodeFactory(runFn);
    }

    public load(source: string): Promise<IChaincodeFactory> {
        return Promise.resolve(this.factory);
    }
}
