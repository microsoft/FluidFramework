// import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
// import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
// import { SharedObjectSequence } from "@microsoft/fluid-sequence";

// export class DullArray<T> {
//     constructor(private store: ISharedMap) {

//     }

//     // public getItems(start: number, end?: number) {
//     //     return this.sequence.``
//     // }

//     public get(index: number): T {
//         const len = this.store.size;
//         if (index >= len) {
//             throw new Error(`index ${index} out of range (len: ${len})`);
//         }
//         return this.store.get(index.toString());
//     }

//     public set(index: number, value: T) {
//         const len = this.store.size;
//         if (index >= len) {
//             throw new Error(`index ${index} out of range (len: ${len})`);
//         }
//         this.store.set(index.toString(), value);
//     }

//     public add(value: T) {
//         this.set(this.store.size, value);
//     }

//     public static create<T>(runtime: IComponentRuntime) {
//         const newSequence = SharedObjectSequence.create<T>(runtime);
//         return new DullArray<T>(newSequence);
//     }
// }