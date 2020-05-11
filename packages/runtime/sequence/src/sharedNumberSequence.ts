/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRuntime, IChannelAttributes } from "@microsoft/fluid-component-runtime-definitions";
import { SharedNumberSequenceFactory } from "./sequenceFactory";
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
        return runtime.createChannel(id,
            SharedNumberSequenceFactory.Type) as SharedNumberSequence;
    }

    /**
     * Get a factory for SharedNumberSequence to register with the component.
     *
     * @returns a factory that creates and load SharedNumberSequence
     */
    public static getFactory() {
        return new SharedNumberSequenceFactory();
    }

    constructor(document: IComponentRuntime, public id: string, attributes: IChannelAttributes) {
        super(document, id, attributes, SharedNumberSequenceFactory.segmentFromSpec);
    }

    public getRange(start: number, end?: number) {
        return this.getItems(start, end);
    }
}
