import { IPlatform } from "@prague/runtime-definitions";
import { EventEmitter } from "events";

export class Platform extends EventEmitter implements IPlatform {
    public queryInterface<T>(id: string) {
        return null;
    }
}
