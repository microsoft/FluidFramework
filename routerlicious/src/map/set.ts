import { ISet } from "../data-types";
import { IMapOperation, IMapValue, ValueType } from "./definitions";
import { CollaborativeMap } from "./map";

export class DistributedSet<T> implements ISet<T> {
    private internalSet: Set<T>;

    constructor(private key: string, values: T[], private map: CollaborativeMap) {
        this.internalSet = new Set<T>(values);
    }

    public add(value: T, submitEvent = true): ISet<T> {
        this.internalSet.add(value);

        if (submitEvent) {
            const operationValue: IMapValue = {
                type: ValueType[ValueType.Set],
                value,
            };
            const op: IMapOperation = {
                key: this.key,
                type: "insertSet",
                value: operationValue,
            };

            this.map.submitMapMessage(op);
        }

        this.map.emit("valueChanged", { key: this.key });
        this.map.emit("setElementAdded", { key: this.key, value });

        return this;
    }

    public delete(value: T, submitEvent = true): ISet<T> {
        this.internalSet.delete(value);

        if (submitEvent) {
            const operationValue: IMapValue = { type: ValueType[ValueType.Set], value };
            const op: IMapOperation = {
                key: this.key,
                type: "deleteSet",
                value: operationValue,
            };

            this.map.submitMapMessage(op);
        }

        this.map.emit("valueChanged", { key: this.key });
        this.map.emit("setElementRemoved", { key: this.key, value });

        return this;
    }

    public entries(): any[] {
        return Array.from(this.internalSet.values());
    }
}
