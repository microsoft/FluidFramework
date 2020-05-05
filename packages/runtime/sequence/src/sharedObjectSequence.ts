/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRuntime, IChannelAttributes } from "@microsoft/fluid-runtime-definitions";
import { SharedObjectSequenceFactory } from "./sequenceFactory";
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
        return runtime.createChannel(id, SharedObjectSequenceFactory.Type) as SharedObjectSequence<T>;
    }

    /**
     * Get a factory for SharedObjectSequence to register with the component.
     *
     * @returns a factory that creates and load SharedObjectSequence
     */
    public static getFactory() {
        return new SharedObjectSequenceFactory();
    }

    constructor(document: IComponentRuntime, public id: string, attributes: IChannelAttributes) {
        super(document, id, attributes, SharedObjectSequenceFactory.segmentFromSpec);
    }

    public getRange(start: number, end?: number) {
        return this.getItems(start, end);
    }
}
