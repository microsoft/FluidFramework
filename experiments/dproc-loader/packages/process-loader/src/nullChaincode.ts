import {
    IChaincodeComponent,
    IChaincodeHost,
    IComponentPlatform,
    IComponentRuntime,
    IDeltaHandler,
    IHostRuntime,
} from "@prague/process-definitions";
import { IPlatform } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { debug } from "./debug";

class NullPlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string) {
        return null;
    }
}

class NullChaincodeComponent implements IChaincodeComponent {
    public getModule(type: string) {
        throw new Error("Not supported");
    }

    public async close(): Promise<void> {
        return Promise.reject("Not supported");
    }

    public async run(runtime: IComponentRuntime, platform: IPlatform): Promise<IDeltaHandler> {
        return Promise.reject("Not supported");
    }

    public attach(platform: IComponentPlatform): Promise<IComponentPlatform> {
        throw new Error("Method not implemented.");
    }
}

class NullChaincodeHost implements IChaincodeHost {
    public getModule(type: string) {
        debug("getModule");
        return null;
    }

    public async close(): Promise<void> {
        debug("close");
        return;
    }

    public async run(runtime: IHostRuntime, platform: IPlatform): Promise<IPlatform> {
        debug("I BE NULL!!!");
        return new NullPlatform();
    }
}

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    return new NullChaincodeComponent();
}

export async function instantiateHost(): Promise<IChaincodeHost> {
    return new NullChaincodeHost();
}
