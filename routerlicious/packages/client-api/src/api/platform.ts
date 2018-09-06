import { IPlatform } from "@prague/runtime-definitions";

export class Platform implements IPlatform {
    public queryInterface<T>(id: string) {
        return null;
    }
}
