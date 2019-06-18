/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRuntime, ISharedObjectServices } from "@prague/runtime-definitions";
import { SharedObjectSequenceExtension } from "./extension";
import { SharedSequence } from "./sharedSequence";

export class SharedObjectSequence<T> extends SharedSequence<T> {
    /**
     * Create a new shared object sequence
     *
     * @param runtime - component runtime the new shared object sequence belongs to
     * @param id - optional name of the shared object sequence
     * @returns newly create shared object sequence (but not attached yet)
     */
    public static create<T>(runtime: IComponentRuntime, id?: string) {
        return runtime.createChannel(SharedSequence.getIdForCreate(id),
            SharedObjectSequenceExtension.Type) as SharedObjectSequence<T>;
    }

    /**
     * Get a factory for SharedObjectSequence to register with the component.
     *
     * @returns a factory that creates and load SharedObjectSequence
     */
    public static getFactory() {
        return new SharedObjectSequenceExtension();
    }

    constructor(
        document: IComponentRuntime,
        public id: string,
        services?: ISharedObjectServices) {
        super(document, id, SharedObjectSequenceExtension.Type, services);
    }

    public getRange(start: number, end?: number) {
        return this.getItems(start, end);
    }
}
