import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { SequenceDeltaEvent, SharedObjectSequence } from "@microsoft/fluid-sequence";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";
// import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";

export interface IMinimalArray<T> {
    get(index: number): T,
    set(index: number, item: T): void,
    push(...items: T[]): number,
    pop(): T,
    shift(): T,
    unshift(...items: T[]): number,
    hostRuntime: IHostRuntime,
}

// const rowNum = 0;

export class BadArray<T> {
    // public static create<T>(runtime: IComponentRuntime, hostRuntime: IHostRuntime) {
    //     const newSequence = SharedObjectSequence.create<T>(runtime);
    //     return new BadArray(newSequence, runtime, hostRuntime);
    // }

    // public static createWithData<T>(runtime: IComponentRuntime, hostRuntime: IHostRuntime, items: T[]) {
    //     const newSequence = SharedObjectSequence.create<T>(runtime);
    //     newSequence.insert(0, items);
    //     return new BadArray(newSequence, runtime, hostRuntime);
    // }

    public static get<T>(store: SharedObjectSequence<T>, index: number): T {
        const len = store.getLength();
        if (index >= len) {
            throw new Error(`index out of range (${index} >= ${len})`);
        }
        let items = store.getItems(index, index + 1);
        return items[0];
    }

    public static set<T>(store: SharedObjectSequence<T>, hostRuntime: IHostRuntime, index: number, value: T): void {
        const len = store.getLength();
        if (index >= len) {
            throw new Error(`index out of range (${index} >= ${len})`);
        }

        hostRuntime.orderSequentially(() => {
            store.insert(index, [value]);
            store.remove(index + 1, index + 2);
        });
    }

    public static push<T>(store: SharedObjectSequence<T>, items?: T[], ...rest: T[]): number {
        let toStore = items ?? rest;
        if (items) {
            toStore.push(...rest);
        }
        store.insert(store.getLength(), items);
        console.log(`pushed: ${toStore.length} items to ${store.id}; new sequence length: ${store.getLength()}`);
        return store.getLength();
    }

    // public static pop<T>(store: SharedObjectSequence<T>): T {
    //     let item = store.getItems(store.getLength() - 1, store.getLength() - 1)[0];
    //     store.remove(store.getLength() - 1, store.getLength() - 1);
    //     return item;
    // }

    // public static shift<T>(store: SharedObjectSequence<T>): T {
    //     let item = store.getItems(0, 0)[0];
    //     store.remove(0, 0);
    //     return item;
    // }

    // public static unshift<T>(store: SharedObjectSequence<T>, items?: T[], ...rest: T[]): number {
    //     let toStore = items ?? rest;
    //     if (items) {
    //         toStore.push(...rest);
    //     }

    //     store.insert(0, toStore);
    //     return store.getLength();
    // }

    public static all<T>(store: SharedObjectSequence<T>): T[] {
        return store.getItems(0);
    }

    // public getHandle = () => store.handle;

    private deltaHandler = (event: SequenceDeltaEvent, target: SharedObjectSequence<T>) => {
        // do something
    }
}
