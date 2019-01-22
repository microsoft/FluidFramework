import { IPlatform } from "@prague/runtime-definitions";
import { EventEmitter } from "events";

export class MyPlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string): Promise<T> {
        return null;
    }
}
