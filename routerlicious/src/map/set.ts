import { ISet } from "../data-types";
import { CollaborativeMap } from "./map";

export class DistributedSet<T> implements ISet<T> {

    private internalSet: Set<T>;

    constructor(public parentMap: CollaborativeMap, public key: string) {

    }

    public init(values: T[]): ISet<T> {
        this.internalSet = new Set<T>(values);
        return this;
    }

    public add(value: T): ISet<T> {
        return this.parentMap.insertSet(this.key, value);
    }

    public delete(value: T): ISet<T> {
        return this.parentMap.deleteSet(this.key, value);
    }

    public entries(): any[] {
        return this.parentMap.enumerateSet(this.key);
    }

    public getInternalSet(): Set<T> {
        return this.internalSet;
    }
}
