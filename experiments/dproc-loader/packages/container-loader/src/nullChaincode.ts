import { IChaincodeHost, IContext, IPlatform } from "@prague/container-definitions";
import { EventEmitter } from "events";

class NullPlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string) {
        return null;
    }
}

class NullChaincodeHost implements IChaincodeHost {
    public getModule(type: string) {
        return null;
    }

    public async close(): Promise<void> {
        return;
    }

    public async run(context: IContext): Promise<IPlatform> {
        return new NullPlatform();
    }
}

export async function instantiateHost(): Promise<IChaincodeHost> {
    return new NullChaincodeHost();
}
