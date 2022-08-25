/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    List, walkList,
} from "../collections";

describe("Collections.List", () => {
    const listCount = 5;
    let list: List<number>;

    beforeEach(() => {
        list = new List<number>();
        for (let i = 0; i < listCount; i++) {
            list.unshift(i);
        }
    });

    describe(".length", () => {
        it("Should return the total number of items in the list",
            () => assert.equal(list.length, listCount, "The list count doesn't match the expected count."));
    });

    describe(".first", () => {
        it("Should return the first item in the list",
            () => assert.equal(list.first?.data, listCount - 1, "first item not expected value"));
    });

    describe(".last", () => {
        it("Should return the last item in the list",
            () => assert.equal(list.last?.data, 0, "last item not expected value"));
    });

    describe("walkList", () => {
        it("Should walk all items of the list", () => {
            let i = listCount - 1;
            walkList(list, (node) => {
                assert.equal(node.data, i, "elemeted not expected value");
                i--;
            });
        });
    });

    describe(".iterator", () => {
        it("Should walk all items of the list", () => {
            let i = listCount - 1;
            for (const item of list) {
                assert.equal(item.data, i, "elemeted not expected value");
                i--;
            }
        });
    });

    describe(".unshift", () => {
        it("Should add item to the start of the list",
            () => {
                list.unshift(99);
                assert.equal(list.first?.data, 99, "first item not expected value");
                assert.equal(list.length, listCount + 1, "The list count doesn't match the expected count.");
            });
    });
    describe(".push", () => {
        it("Should add item to the end of the list",
            () => {
                list.push(99);
                assert.equal(list.last?.data, 99, "last item not expected value");
                assert.equal(list.length, listCount + 1, "The list count doesn't match the expected count.");
            });
    });
});
