/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview In this file, we will test the squashing of two
 *    reversible changesets.
 */
 import { expect } from 'chai';
import { ChangeSet, SerializedChangeSet } from "../changeset";

describe("Squash Reversible ChangeSets", function() {
    it("Squashing artificial reversible changesets ", () => {
        const cs1s: SerializedChangeSet = {
            String: {
                x: {
                    oldValue: "a",
                    value: "b",
                },
            },
        };
        const cs2s: SerializedChangeSet = {
            String: {
                y: {
                    oldValue: "c",
                    value: "d",
                },
            },
        };
        const ch1: ChangeSet = new ChangeSet(cs1s);
        const ch2: ChangeSet = new ChangeSet(cs2s);
        ch1.applyChangeSet(ch2);
        expect(ch1._changes.String.y.oldValue).equal("c");
    });
});
