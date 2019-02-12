import { IPlatform, IPlatformFactory } from "@prague/container-definitions";
import { EventEmitter } from "events";

export class WebPlatform extends EventEmitter implements IPlatform {
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

export class WebPlatformFactory implements IPlatformFactory {
    // Very much a temporary thing as we flesh out the platform interfaces
    private lastPlatform: WebPlatform;

    constructor(private div: HTMLElement) {
    }

    public async create(): Promise<IPlatform> {
        // tslint:disable-next-line:no-inner-html
        this.div.innerHTML = "";
        this.lastPlatform = new WebPlatform(this.div);
        return this.lastPlatform;
    }

    // Temporary measure to indicate the UI changed
    public update() {
        if (!this.lastPlatform) {
            return;
        }

        this.lastPlatform.emit("update");
    }
}
