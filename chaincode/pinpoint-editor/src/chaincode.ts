import { ComponentHost } from "@prague/component";
import { IPlatform, ITree } from "@prague/container-definitions";
import { MapExtension } from "@prague/map";
import {
    IChaincode,
    IChaincodeComponent,
    IComponentDeltaHandler,
    IComponentRuntime,
    IRuntime} from "@prague/runtime-definitions";
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
    private component: ComponentHost;

    constructor() {
        this.chaincode = new Chaincode(this.pinpoint);
    }

    public getModule(type: string) {
        return null;
    }

    public async close(): Promise<void> {
        return;
    }

    public async run(runtime: IComponentRuntime): Promise<IComponentDeltaHandler> {
        const chaincode = this.chaincode;

        const component = await ComponentHost.LoadFromSnapshot(runtime, chaincode);
        this.component = component;

        return component;
    }

    public async attach(platform: IPlatform): Promise<IPlatform> {
        return this.pinpoint.attach(platform);
    }

    public snapshot(): ITree {
        const entries = this.component.snapshotInternal();
        return { entries };
    }
}
