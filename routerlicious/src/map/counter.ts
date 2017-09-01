import * as api from "../api";
import { MapView } from "./";

export class Counter implements api.ICounter {
    constructor(private parentMap: MapView, private key: string, private min: Number, private max: Number) {

    }
    public increment(value: number): Promise<void> {
        const currentValue = this.parentMap.get(this.key) as number;
        if (currentValue === undefined) {
            return Promise.reject(`Error: No value found to increment!`);
        }
        const nextValue = currentValue + value;
        if ((nextValue < this.min) || (nextValue > this.max)) {
            return Promise.reject(`Error: Counter range exceeded!`);
        }
        return Promise.resolve(this.parentMap.incrementCounter(this.key, value));
    }
}
