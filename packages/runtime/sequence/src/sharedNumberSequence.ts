import { IComponentRuntime, ISharedObjectServices } from "@prague/runtime-definitions";
import { SharedNumberSequenceExtension } from "./extension";
import { SharedSequence } from "./sharedSequence";

export class SharedNumberSequence extends SharedSequence<number> {
    constructor(
        document: IComponentRuntime,
        public id: string,
        services?: ISharedObjectServices) {
        super(document, id, SharedNumberSequenceExtension.Type, services);
    }

    public getRange(start: number, end?: number) {
        return this.getItems(start, end);
    }
}
