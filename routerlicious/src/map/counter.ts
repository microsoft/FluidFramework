import { ICounter } from "../data-types";
import { IMapOperation, IMapValue, ValueType } from "./definitions";
import { CollaborativeMap } from "./map";

export class Counter implements ICounter {
    constructor(
        private key: string,
        private internalValue: number,
        private min: number,
        private max: number,
        private map: CollaborativeMap) {
    }

    public increment(value: number, submitEvent = true): ICounter {
        if (typeof value !== "number") {
            throw new Error("Incremental amount should be a number.");
        }

        const nextValue = this.internalValue + value;
        if ((nextValue < this.min) || (nextValue > this.max)) {
            throw new Error("Error: Counter range exceeded!");
        }

        this.internalValue = nextValue;

        if (submitEvent) {
            const operationValue: IMapValue = {type: ValueType[ValueType.Counter], value};
            const op: IMapOperation = {
                key: this.key,
                type: "incrementCounter",
                value: operationValue,
            };

            this.map.submitMapMessage(op);
        }

        this.map.emit("valueChanged", { key: this.key });
        this.map.emit("incrementCounter", { key: this.key, value });

        return this;
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
