import { IPlatform } from "@prague/container-definitions";
import { EventEmitter } from "events";

export class HostPlatform extends EventEmitter implements IPlatform {
    constructor(private div: HTMLElement) {
        super();
    }

    public async queryInterface(id: string): Promise<any> {
        if (id === "div") {
            return this.div;
        } else {
            return null;
        }
    }

    public async detach() {
        return;
    }
}
