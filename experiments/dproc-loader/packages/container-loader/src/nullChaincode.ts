import { IContext, IPlatform } from "@prague/container-definitions";
import { EventEmitter } from "events";

class NullPlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string) {
        return null;
    }
}

export async function instantiateContainer(context: IContext): Promise<IPlatform> {
    return new NullPlatform();
}
