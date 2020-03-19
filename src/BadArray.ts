import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { SequenceDeltaEvent, SharedObjectSequence } from "@microsoft/fluid-sequence";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";
// import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";

export interface IMinimalArray<T> {
    get(index: number): T,
    set(index: number, item: T): void,
    push(...items: [T]): number,
    pop(): T,
    shift(): T,
    unshift(...items: [T]): number,
    hostRuntime: IHostRuntime,
}

// const rowNum = 0;

export class BadArray<T> implements IMinimalArray<T> {

    constructor(private store: SharedObjectSequence<T>, private runtime: IComponentRuntime, public hostRuntime: IHostRuntime) {
        store.on("sequenceDelta", this.deltaHandler);
    }

    public static create<T>(runtime: IComponentRuntime, hostRuntime: IHostRuntime) {
        const newSequence = SharedObjectSequence.create<T>(runtime);
        return new BadArray(newSequence, runtime, hostRuntime);
    }

    public static createWithData<T>(runtime: IComponentRuntime, hostRuntime: IHostRuntime, items: T[]) {
        const newSequence = SharedObjectSequence.create<T>(runtime);
        newSequence.insert(0, items);
        return new BadArray(newSequence, runtime, hostRuntime);
    }

    public get(index: number): T {
        const len = this.store.getLength();
        if (index >= len) {
            throw new Error(`index out of range (${index} >= ${len})`);
        }
        return this.store.getItems(index, index)[0];
    }

    public set(index: number, value: T): void {
        const len = this.store.getLength();
        if (index >= len) {
            throw new Error(`index out of range (${index} >= ${len})`);
        }
        this.hostRuntime.orderSequentially(() => {
            this.store.insert(index, [value]);
            this.store.remove(index + 1, index + 1);
        });
    }

    public push(...items: [T]): number {
        this.store.insert(this.store.getLength(), items);
        return this.store.getLength();
    }

    public pop(): T {
        let item = this.store.getItems(this.store.getLength() - 1, this.store.getLength() - 1)[0];
        this.store.remove(this.store.getLength() - 1, this.store.getLength() - 1);
        return item;
    }

    public shift(): T {
        let item = this.store.getItems(0, 0)[0];
        this.store.remove(0, 0);
        return item;
    }

    public unshift(...items: [T]): number {
        this.store.insert(0, items);
        return this.store.getLength();
    }

    public all(): T[] {
        return this.store.getItems(0);
    }

    public getHandle = () => this.store.handle;

    private deltaHandler = (event: SequenceDeltaEvent, target: SharedObjectSequence<T>) => {
        // do something
    }
}
