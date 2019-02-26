// tslint:disable max-classes-per-file
import { IPlatform } from "@prague/container-definitions";
import { EventEmitter } from "events";

class WebPlatform extends EventEmitter implements IPlatform {
    constructor(private div: HTMLElement) {
        super();
    }

    public async queryInterface<T>(id: string): Promise<any> {
        switch (id) {
            case "dom":
                return document;
            case "div":
                return this.div;
            default:
                return null;
        }
    }

    public detach() {
        return;
    }
}

export class LocalPlatform extends WebPlatform {
    constructor(div: HTMLElement) {
        super(div);
    }

    public async detach() {
        return;
    }
}
