import { ISet } from "../data-types";
import { CollaborativeMap } from "./map";

export class DistributedSet<T> implements ISet<T> {

    public static initSet<T>(values: T[]): T[] {
        const newSet = new Set<T>(values);
        return Array.from(newSet);
    }

    public static addElement<T>(values: T[], elementToAdd: T): T[] {
        const newSet = new Set<T>(values);
        newSet.add(elementToAdd);
        return Array.from(newSet);
    }

    public static removeElement<T>(values: T[], elementToRemove: T): T[] {
        const newSet = new Set<T>(values);
        newSet.delete(elementToRemove);
        return Array.from(newSet);
    }

    constructor(private parentMap: CollaborativeMap, private key: string) {

    }

    public add(value: T): Promise<T[]> {
        return this.parentMap.insertSet(this.key, value);
    }

    public delete(value: T): Promise<T[]> {
        return this.parentMap.deleteSet(this.key, value);
    }

    public entries(): Promise<T[]> {
        return this.parentMap.enumerateSet(this.key);
    }
}
