import {
    IChaincodeComponent,
    IChaincodeHost,
    IComponentRuntime,
    IHostRuntime,
} from "@prague/process-definitions";
import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { ComponentHost } from "./componentHost";
import { debug } from "./debug";

class MyPlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string): Promise<T> {
        return null;
    }
}

class MyChaincode implements IChaincode {
    public getModule(type: string) {
        throw new Error("Method not implemented.");
    }

    public close(): Promise<void> {
        throw new Error("Method not implemented.");
    }

    public run(runtime: IRuntime, platform: IPlatform): Promise<IPlatform> {
        throw new Error("Method not implemented.");
    }
}

class MyChaincodeComponent implements IChaincodeComponent {
    public getModule(type: string) {
        debug("getModule");
        return null;
    }

    public async close(): Promise<void> {
        debug("close");
        return;
    }

    public async run(runtime: IComponentRuntime, platform: IPlatform): Promise<IPlatform> {
        debug("WE RUNNIN YO!!! :)");

        const chaincode = new MyChaincode();

        // All of the below would be hidden from a developer
        // Is this an await or does it just go?
        const component = await ComponentHost.LoadFromSnapshot(
            runtime.tenantId,
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
            runtime.submitFn,
            runtime.snapshotFn,
            runtime.closeFn);

        return component.platform;
    }
}

class MyChaincodeHost implements IChaincodeHost {
    public async getModule(type: string) {
        debug("getModule");
        return new MyChaincodeComponent();
    }

    public async close(): Promise<void> {
        debug("close");
        return;
    }

    // I believe that runtime needs to have everything necessary for this thing to actually load itself once this
    // method is called
    public async run(runtime: IHostRuntime, platform: IPlatform): Promise<IPlatform> {
        debug(`MyChaincodeHost ${runtime.existing ? "" : "NOT"} existing document`);
        this.doWork(runtime).catch((error) => {
            runtime.error(error);
        });

        return new MyPlatform();
    }

    public async doWork(runtime: IHostRuntime) {
        if (!runtime.existing) {
            const root = await runtime.createProcess("root", "@prague/test-component");
            runtime.attachProcess(root);
        } else {
            await runtime.getProcess("root");
        }
    }
}

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    return new MyChaincodeComponent();
}

export async function instantiateHost(): Promise<IChaincodeHost> {
    return new MyChaincodeHost();
}
