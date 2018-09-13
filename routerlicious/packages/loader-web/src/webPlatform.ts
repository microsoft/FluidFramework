import { IPlatform } from "@prague/runtime-definitions";
import { EventEmitter } from "events";

export class WebPlatform extends EventEmitter implements IPlatform {
    constructor(private div: HTMLElement) {
        super();
    }

    public queryInterface<T>(id: string) {
        switch (id) {
            case "dom":
                return document;
            case "div":
                return this.div;
            default:
                return null;
        }
    }

    // Temporary measure to indicate the UI changed
    public update() {
        this.emit("update");
    }
}
