import * as api from "../api";
import { CollaborativeMap } from "./";

export class Counter implements api.ICounter {
    constructor(private parentMap: CollaborativeMap, private key: string, private min: number, private max: number) {

    }
    public increment(value: number): Promise<void> {
        return this.parentMap.incrementCounter(this.key, value, this.min, this.max);
    }
    public get(): Promise<number> {
        return this.parentMap.getCounterValue(this.key);
    }
}
