/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import { IValueChanged } from "@fluidframework/map";

import { IOptionPicker } from "@fluid-example/multiview-option-picker-interface";

const optionValueKey = "optionValue";

/**
 * The OptionPicker is our implementation of the IOptionPicker interface.
 */
export class OptionPicker extends PrimedComponent implements IOptionPicker {
    public static get ComponentName() { return "@fluid-example/option-picker"; }

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

export const OptionPickerInstantiationFactory = new PrimedComponentFactory(
    OptionPicker.ComponentName,
    OptionPicker,
    [],
    {},
);
