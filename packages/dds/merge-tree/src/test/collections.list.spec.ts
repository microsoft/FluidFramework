/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    List,
    ListMakeHead,
} from "../collections";

describe("Collections.List", () => {
    const listCount = 5;
    let list: List<number>;

    beforeEach(() => {
        list = ListMakeHead<number>();
        for (let i = 0; i < listCount; i++) {
            list.unshift(i);
        }
    });

    describe(".count", () => {
        it("Should return the total number of items in the list",
            () => assert.equal(list.count(), listCount, "The list count doesn't match the expected count."));
    });

    describe(".first", () => {
        it("Should return the first item in the list",
            () => assert.equal(list.first(), listCount - 1, "first item not expected value"));
    });

    describe(".last", () => {
        it("Should return the last item in the list",
            () => assert.equal(list.last(), 0, "last item not expected value"));
    });

    describe(".isHead", () => {
        it("Should return true for the head of the list",
            () => assert.equal(list.isHead, true, "expected node is not head"));

        it("Should return false when not the head of the list",
            () => assert.equal(list.next.isHead, false, "unexpected node is head"));
    });

    describe(".walk", () => {
        it("Should walk all items of the list", () => {
            let i = listCount - 1;
            list.walk((data) => {
                assert.equal(data, i, "elemeted not expected value");
                i--;
            });
        });
    });

    describe(".iterator", () => {
        it("Should walk all items of the list", () => {
            let i = listCount - 1;
            for (const item of list) {
                assert.equal(item, i, "elemeted not expected value");
                i--;
            }
        });
    });

    describe(".unshift", () => {
        it("Should add item to the start of the list",
            () => {
                list.unshift(99);
                assert.equal(list.first(), 99, "first item not expected value");
                assert.equal(list.count(), listCount + 1, "The list count doesn't match the expected count.");
            });
    });
    describe(".enqueue", () => {
        it("Should add item to the end of the list",
            () => {
                list.enqueue(99);
                assert.equal(list.last(), 99, "last item not expected value");
                assert.equal(list.count(), listCount + 1, "The list count doesn't match the expected count.");
            });
    });
});
