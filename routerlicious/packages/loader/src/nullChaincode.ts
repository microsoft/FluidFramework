import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";

export class NullChaincode implements IChaincode {
    public getModule(type: string): any {
        return null;
    }

    public close(): Promise<void> {
        return Promise.resolve();
    }

    public run(runtime: IRuntime, platform: IPlatform): Promise<void> {
        return Promise.resolve();
    }
}
