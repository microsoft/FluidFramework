import { ICounter } from "../data-types";
import { CollaborativeMap } from "./map";

export class Counter implements ICounter {

    private internalValue: number;

    constructor(private parentMap: CollaborativeMap, private key: string, private min: number, private max: number) {

    }

    public init(value: number): ICounter {
        this.internalValue = value;
        return this;
    }

    public set(value: number) {
        this.internalValue = value;
    }

    public increment(value: number): ICounter {
        return this.parentMap.incrementCounter(this.key, value, this.min, this.max);
    }

    public get(): number {
        return this.internalValue;
    }

    public getMin(): number {
        return this.min;
    }

    public getMax(): number {
        return this.max;
    }
}
