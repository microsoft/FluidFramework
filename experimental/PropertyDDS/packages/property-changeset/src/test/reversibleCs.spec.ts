/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview In this file, we will test the path helper functions described in /src/properties/path_helper.js
 */

import { copy as cloneDeep } from "fastest-json-copy";

import { ChangeSet } from "../changeset";

describe("Reversible ChangeSets", function() {
    it("Inverting a string map insert", () => {
        const originalCS = {
            "map<String>": {
                selections: {
                    insert: {
                        target: "c6e96078-d1eb-8d41-219f-6f935794c453",
                    },
                },
            },
        };
        const invertedCS = new ChangeSet(cloneDeep(originalCS));
        invertedCS.toInverseChangeSet();

        const combined = new ChangeSet(originalCS);
        combined.applyChangeSet(invertedCS);
    });

    it("Inverting a string map remove", () => {
        const originalCS = {
            "map<String>": {
                selections: {
                    remove: {
                        target: "c6e96078-d1eb-8d41-219f-6f935794c453",
                    },
                },
            },
        };
        const invertedCS = new ChangeSet(cloneDeep(originalCS));
        invertedCS.toInverseChangeSet();

        const combined = new ChangeSet(originalCS);
        combined.applyChangeSet(invertedCS);
    });
});
