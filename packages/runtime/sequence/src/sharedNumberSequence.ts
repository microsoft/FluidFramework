import { IComponentRuntime, ISharedObjectServices } from "@prague/runtime-definitions";
import { SharedNumberSequenceExtension } from "./extension";
import { SharedSequence } from "./sharedSequence";

export class SharedNumberSequence extends SharedSequence<number> {
    /**
     * Create a new shared number sequence
     *
     * @param runtime - component runtime the new shared number sequence belongs to
     * @param id - optional name of the shared number sequence
     * @returns newly create shared number sequence (but not attached yet)
     */
    public static create(runtime: IComponentRuntime, id?: string) {
        return runtime.createChannel(SharedSequence.getIdForCreate(id),
            SharedNumberSequenceExtension.Type) as SharedNumberSequence;
    }

    /**
     * Get a factory for SharedNumberSequence to register with the component.
     *
     * @returns a factory that creates and load SharedNumberSequence
     */
    public static getFactory() {
        return new SharedNumberSequenceExtension();
    }

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
