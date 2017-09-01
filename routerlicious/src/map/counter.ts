import * as api from "../api";
import { MapView } from "./";

export class Counter implements api.ICounter {
    constructor(private parentMap: MapView, private key: string) {

    }
    public increment(value: number): Promise<void> {
        return Promise.resolve(this.parentMap.incrementCounter(this.key, value));
    }
}
