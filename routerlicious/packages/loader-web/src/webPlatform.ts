import { IPlatform } from "@prague/runtime-definitions";

export class WebPlatform implements IPlatform {
    constructor(private div: HTMLElement) {
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
}
