import * as api from "../api";
import { Map } from "./";

export class Counter implements api.ICounter {
    constructor(private parentMap: Map, private key: string, private min: number, private max: number) {

    }
    public increment(value: number): Promise<void> {
        return this.parentMap.incrementCounter(this.key, value, this.min, this.max);
    }
}
