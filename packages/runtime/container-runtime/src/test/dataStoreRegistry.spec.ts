/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
    NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import { FluidDataStoreRegistry } from "../dataStoreRegistry";

describe("Data Store Registry Creation Tests", () => {
    // Define two entries with the same name
    const defaultName = "default";
    const entries = [[defaultName, []], [defaultName, []]];

    it("Validate duplicate name entries", () => {
        try {
            const fluidDataStoreRegistry = new FluidDataStoreRegistry(entries as NamedFluidDataStoreRegistryEntries);
        } catch (error: any) {
            // success = false;
            assert.strictEqual(error.message, "Duplicate entry names exist");
        }
    });
});
