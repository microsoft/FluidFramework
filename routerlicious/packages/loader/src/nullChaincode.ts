import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";
import { EventEmitter } from "events";

class NullPlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string) {
        return null;
    }
}

export class NullChaincode implements IChaincode {
    public getModule(type: string): any {
        return null;
    }

    /* tslint:disable:promise-function-async */
    public close(): Promise<void> {
        return Promise.resolve();
    }

    public run(runtime: IRuntime, platform: IPlatform): Promise<IPlatform> {
        return Promise.resolve(new NullPlatform());
    }
}
