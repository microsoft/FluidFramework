import { IPlatform } from "@prague/container-definitions";
import { EventEmitter } from "events";

export class WebPlatform extends EventEmitter implements IPlatform {
    constructor(private readonly div: HTMLElement) {
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
