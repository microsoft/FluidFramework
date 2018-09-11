import { IPlatform } from "@prague/runtime-definitions";

export class WebPlatform implements IPlatform {
    public queryInterface<T>(id: string) {
        switch (id) {
            case "dom":
                return document;
            default:
                return null;
        }
    }
}
