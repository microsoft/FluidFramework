// import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
// import { SharedObjectSequence } from "@microsoft/fluid-sequence";

// export class DullSequence<T> {
//     constructor(private sequence: SharedObjectSequence<T>) {

//     }

//     public getItems(start: number, end?: number) {
//         return this.sequence.getItems(start, end);
//     }

//     public get(index: number): T {
//         const len = this.sequence.getLength();
//         if (index >= len) {
//             throw new Error(`index ${index} out of range (len: ${len})`);
//         }
//         return this.sequence.getItems(index, index)[0];
//     }

//     public set(index: number, value: T) {

//     }

//     public add(value: T) {
//         this.sequence.insert(this.sequence.getLength(), [value]);
//     }

//     public static create<T>(runtime: IComponentRuntime) {
//         const newSequence = SharedObjectSequence.create<T>(runtime);
//         return new DullSequence<T>(newSequence);
//     }
// }