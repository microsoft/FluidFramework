import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { SequenceDeltaEvent, SparseMatrix, SparseMatrixItem } from "@microsoft/fluid-sequence";
// import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";

const rowNum = 0;

type BadArrayItem = SparseMatrixItem;

export class BadArray<T extends BadArrayItem> {
    constructor(private store: SparseMatrix) {
        store.on("sequenceDelta", deltaHandler);
    }

    public static create<T>(runtime: IComponentRuntime) {
        const newSequence = SparseMatrix.create(runtime);
        newSequence.insertRows(rowNum, 1);
        return new BadArray(newSequence);
    }

    public get(index: number): T {
        const len = this.store.getLength();
        if (index >= len) {
            throw new Error(`index ${index} out of range (len: ${len})`);
        }
        return this.store.getItem(rowNum, index) as T;
    }

    public set(index: number, value: T) {
        this.store.setItems(rowNum, index, [value]);
    }

    public add(value: T) {
        this.set(this.store.getLength(), value);
    }

    public all(): T[] {
        let allItems = Array<T>();

        // this probably isn't good...
        for (let i = 0; i < this.store.getLength(); i++) {
            allItems.push(this.store.getItem(rowNum, i) as T);
        }
        return allItems;
    }

    public getHandle = () => this.store.handle;
}

// TODO
const deltaHandler = (event: SequenceDeltaEvent, target: SparseMatrix) => {
    // do something
}
