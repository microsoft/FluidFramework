/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IValueChanged } from "fluid-framework";

/**
 * IDataController describes the public API surface for our data data object.
 */
export interface IDataController extends EventEmitter {
    /**
     * Get the data
     */
    readonly value: number;

    /**
     * Update data. Will cause a "dataChanged" event to be emitted.
     */
    updateData: () => void;

    /**
     * The dataChanged event will fire whenever someone updates the data, either locally or remotely.
     */
    on(event: "dataChanged", listener: () => void): this;
}

export const counterValueKey = "counterValue";

interface DataControllerProps {
    get: (key: string) => any;
    set: (key: string, value: any) => void;
    on(event: "valueChanged", listener: (args: IValueChanged) => void): this;
    off(event: "valueChanged", listener: (args: IValueChanged) => void): this;
}

/**
 * The DataController is our data object that implements the IDataController interface.
 */
export class DataController extends EventEmitter implements IDataController {
    public static initializeModel(props: DataControllerProps) {
        props.set(counterValueKey, 1);
    }

    constructor(private readonly props: DataControllerProps) {
        super();
        this.props.on("valueChanged", (changed) => {
            this.emit("dataChanged");
        });
    }

    public get value() {
        const value = this.props.get(counterValueKey);
        if (typeof value !== "number") {
            throw new Error(
                "Model is incorrect - did you call DataController.initializeModel() to set it up?",
            );
        }
        return value;
    }

    public readonly updateData = () => {
        this.props.set(counterValueKey, this.value + 1);
    };
}
