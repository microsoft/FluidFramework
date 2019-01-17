import {
    IChaincodeComponent,
    IChaincodeHost,
    IHostRuntime,
} from "@prague/process-definitions";
import { IPlatform, IRuntime } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { ComponentHost } from "./componentHost";
import { debug } from "./debug";

class MyPlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string): Promise<T> {
        return null;
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

    public async run(runtime: IRuntime, platform: IPlatform): Promise<IPlatform> {
        debug("WE RUNNIN YO!!! :)");
        return new MyPlatform();
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
            null, // runtime.blobManager,
            null, // runtime.pkg <- no need since we are IN the code
            null, // chaincode <- also no need since we are in the code
            null, // runtime.tardisMessages,
            runtime.deltaManager,
            runtime.getQuorum(),
            null, // rutnime.storage <- need to provide this
            null, // runtime.connectionState,
            null, // runtime.channels <- this is coming out of the snapshot
            null, // runtime.branch,
            null, // runtime.mininumSequenceNumber
            null, // runtime.submitFn
            null, // runtime.snapshotFn
            null); // runtime.closeFn

        return component.platform;
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
