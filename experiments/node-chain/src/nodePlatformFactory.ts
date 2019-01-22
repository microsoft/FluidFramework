import {
    IPlatform,
    IPlatformFactory,
} from "@prague/runtime-definitions";
import { EventEmitter } from "events";

class NodePlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string): Promise<any> {
        return null;
    }
}

export class NodePlatformFactory implements IPlatformFactory {
    public async create(): Promise<IPlatform> {
        return new NodePlatform();
    }
}
