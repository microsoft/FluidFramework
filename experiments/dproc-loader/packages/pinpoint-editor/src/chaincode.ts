import { MapExtension } from "@prague/map";
import { IChaincodeComponent, IComponentPlatform, IComponentRuntime, IDeltaHandler } from "@prague/process-definitions";
import { ComponentHost } from "@prague/process-utils";
import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";
import * as assert from "assert";
import { EventEmitter } from "events";
import { PinpointRunner } from "./runner";

/**
 * A document is a collection of collaborative types.
 */
class Chaincode extends EventEmitter implements IChaincode {
    private modules = new Map<string, any>();

    /**
     * Constructs a new document from the provided details
     */
    constructor(private runner: any) {
        super();

        this.modules.set(MapExtension.Type, new MapExtension());
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

export class PinpointComponent implements IChaincodeComponent {
    private pinpoint = new PinpointRunner();
    private chaincode: Chaincode;

    constructor() {
        this.chaincode = new Chaincode(this.pinpoint);
    }

    public getModule(type: string) {
        return null;
    }

    public async close(): Promise<void> {
        return;
    }

    public async run(runtime: IComponentRuntime, platform: IPlatform): Promise<IDeltaHandler> {
        const chaincode = this.chaincode;

        // All of the below would be hidden from a developer
        // Is this an await or does it just go?
        const component = await ComponentHost.LoadFromSnapshot(
            runtime,
            runtime.tenantId,
            runtime.documentId,
            runtime.id,
            runtime.platform,
            runtime.parentBranch,
            runtime.existing,
            runtime.options,
            runtime.clientId,
            runtime.user,
            runtime.blobManager,
            runtime.baseSnapshot,
            chaincode,
            runtime.deltaManager,
            runtime.getQuorum(),
            runtime.storage,
            runtime.connectionState,
            runtime.branch,
            runtime.minimumSequenceNumber,
            runtime.snapshotFn,
            runtime.closeFn);

        return component;
    }

    public async attach(platform: IComponentPlatform): Promise<IComponentPlatform> {
        return this.pinpoint.attach(platform);
    }
}
