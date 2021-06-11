import { TinyliciousClient } from "..";

export class ResettableTinyliciousClient extends TinyliciousClient {
    static resetInstance() {
        TinyliciousClient.globalInstance = undefined;
    }
}
