/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";

const VALUE_KEY = "testValue";

// eslint-disable-next-line @typescript-eslint/ban-types
export class TestDataObject extends DataObject<{}> {
    public static get Name() { return "@fluid-internal/test-object"; }

    public static readonly factory = new DataObjectFactory<TestDataObject, undefined, undefined>
        (
            TestDataObject.Name,
            TestDataObject,
            [],
            {},
        );

    protected async initializingFirstTime(initialState?: number) {
        this.root.set(VALUE_KEY, initialState);
    }

    protected async hasInitialized() {
    }

    public get value() {
        return this.root.get(VALUE_KEY);
    }

    public set value(v: number | undefined) {
        this.root.set(VALUE_KEY, v);
    }
}
