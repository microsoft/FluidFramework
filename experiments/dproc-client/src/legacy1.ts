import { IChaincodeComponent } from "@prague/container-definitions";
import { LegacyChaincodeBridge } from "@prague/container-utils";
import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";
import { debug } from "./debug";
import { MyPlatform } from "./legacyPlatform";

class MyChaincode implements IChaincode {
    public getModule(type: string) {
        return null;
    }

    public async close(): Promise<void> {
        return;
    }

    public async run(runtime: IRuntime, platform: IPlatform): Promise<IPlatform> {
        debug("PING!!!!");
        return new MyPlatform();
    }
}

export async function instantiate(): Promise<IChaincode> {
    return new MyChaincode();
}

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    const chaincode = new MyChaincode();
    return new LegacyChaincodeBridge(chaincode);
}
