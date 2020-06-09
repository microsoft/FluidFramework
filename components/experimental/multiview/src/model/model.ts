/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import { IValueChanged } from "@fluidframework/map";

import { IOptionPicker } from "../interface";

const optionValueKey = "optionValue";

/**
 * The OptionPicker is our implementation of the IOptionPicker interface.
 */
export class OptionPicker extends PrimedComponent implements IOptionPicker {
    public static get ComponentName() { return "@fluid-example/option-picker"; }

    /**
     * ComponentInitializingFirstTime is called only once, it is executed only by the first client to open the
     * component and all work will resolve before the view is presented to any user.
     *
     * This method is used to perform component setup, which can include setting an initial schema or initial values.
     */
    protected async componentInitializingFirstTime() {
        this.root.set(optionValueKey, "First");
    }

    protected async componentHasInitialized() {
        this.root.on("valueChanged", (changed: IValueChanged) => {
            if (changed.key === optionValueKey) {
                this.emit("optionChanged");
            }
        });
    }

    public get value() {
        return this.root.get(optionValueKey);
    }

    public readonly setOptionValue = () => {
        this.root.set(optionValueKey, "Second");
    };
}

/**
 * The PrimedComponentFactory declares the component and defines any additional distributed data structures.
 * To add a SharedSequence, SharedMap, or any other structure, put it in the array below.
 */
export const OptionPickerInstantiationFactory = new PrimedComponentFactory(
    OptionPicker.ComponentName,
    OptionPicker,
    [],
    {},
);
