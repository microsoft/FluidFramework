/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

/**
 * IOptionPicker describes the public API surface for our option picker component.
 */
export interface IOptionPicker extends EventEmitter {
    /**
     * Get the option value.
     */
    readonly value: string;

    /**
     * Set the option value.  Will cause a "optionChanged" event to be emitted.
     */
    setOptionValue: () => void;

    /**
     * The optionChanged event will fire whenever someone changes the option, either locally or remotely.
     */
    on(event: "optionChanged", listener: () => void): this;
}
