import { IPlatform, IPlatformFactory } from "@prague/runtime-definitions";
import { EventEmitter } from "events";

export class Platform extends EventEmitter implements IPlatform {
    public queryInterface<T>(id: string) {
        return null;
    }
}

export class PlatformFactory implements IPlatformFactory {
    public async create(): Promise<IPlatform> {
        return new Platform();
    }
}
