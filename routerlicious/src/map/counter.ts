import { ICounter } from "../data-types";
import { CollaborativeMap } from "./map";

export class Counter implements ICounter {
    constructor(private parentMap: CollaborativeMap, private key: string, private min: number, private max: number) {

    }
    public increment(value: number): Promise<void> {
        return this.parentMap.incrementCounter(this.key, value, this.min, this.max);
    }
    public get(): Promise<number> {
        return this.parentMap.getCounterValue(this.key);
    }
}
