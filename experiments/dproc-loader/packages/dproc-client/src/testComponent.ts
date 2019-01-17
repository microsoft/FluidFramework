import {
    IChaincodeComponent,
    IChaincodeHost,
    IHostRuntime,
} from "@prague/process-definitions";
import { IPlatform, IRuntime } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
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
