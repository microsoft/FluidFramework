/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-unused-expressions */
/**
 * @fileoverview In this file, we will test the functions exported by datastructres/collection.js
 */

import semver from "semver";
import { expect } from "chai";
import { SortedCollection } from "../../index";

describe("SortedCollection", function() {
    let collection;
    beforeEach(function() {
        collection = new SortedCollection();
        collection.setComparisonFunction(function(a, b) {
            if (semver.gt(a, b)) {
                return 1;
            } else if (semver.lt(a, b)) {
                return -1;
            }

            return 0;
        });

        collection.bulkAdd({
            "2.0.0": "2.0.0",
            "1.1.0": "1.1.0",
            "1.2.1": "1.2.1",
            "1.10.5": "1.10.5",
            "3.0.0": "3.0.0",
            "101.203.345": "101.203.345",
            "4.0.0": "4.0.0",
            "2.1.0": "2.1.0",
        });
    });

    it("should always sort the order of the keys after altering the collection", function() {
        expect(collection._sortedKeys).to.eql(
            ["1.1.0", "1.2.1", "1.10.5", "2.0.0", "2.1.0", "3.0.0", "4.0.0", "101.203.345"],
        );

        collection.remove("2.0.0");

        expect(collection._sortedKeys).to.eql(
            ["1.1.0", "1.2.1", "1.10.5", "2.1.0", "3.0.0", "4.0.0", "101.203.345"],
        );

        collection.bulkAdd({
            "5.0.0": "5.0.0",
            "0.0.1": "0.0.1",
            "2.3.9": "2.3.9",
        });

        expect(collection._sortedKeys).to.eql([
            "0.0.1", "1.1.0", "1.2.1", "1.10.5", "2.1.0", "2.3.9", "3.0.0", "4.0.0", "5.0.0", "101.203.345",
        ]);

        collection.bulkRemove({
            "5.0.0": "5.0.0",
            "0.0.1": "0.0.1",
            "2.3.9": "2.3.9",
        });

        expect(collection._sortedKeys).to.eql(["1.1.0", "1.2.1", "1.10.5", "2.1.0", "3.0.0", "4.0.0", "101.203.345"]);
    });

    it("should test against adding values for keys that are of type number or string", function() {
        const collection2 = new SortedCollection<string>();
        collection2.add("6.0.0", "6.0.0");
        collection2.add(6.0, "6.0");
        collection2.add(6.2, "6.2");
        expect(collection2.item("6.0.0")).to.equal("6.0.0");
        expect(collection2.item(6.0)).to.equal("6.0");
        expect(collection2.item("6")).to.equal("6.0");
        expect(collection2.item(6.2)).to.equal("6.2");
        expect(collection2.item("6.2")).to.equal("6.2");
    });

    it("should get the nearest next item in the collection", function() {
        let nearestNextItem = collection.getNearestNextItem("0.0.1");
        expect(nearestNextItem).to.equal("1.1.0");

        nearestNextItem = collection.getNearestNextItem("5.0.0");
        expect(nearestNextItem).to.equal("101.203.345");

        nearestNextItem = collection.getNearestNextItem("201.203.345");
        expect(nearestNextItem).to.equal(undefined);

        nearestNextItem = collection.getNearestNextItem("2.0.1");
        expect(nearestNextItem).to.equal("2.1.0");

        nearestNextItem = collection.getNearestNextItem("2.1.1");
        expect(nearestNextItem).to.equal("3.0.0");

        nearestNextItem = collection.getNearestNextItem("3.0.0");
        expect(nearestNextItem).to.equal("3.0.0");
    });

    it("should get the nearest previous item in the collection", function() {
        let nearestNextItem = collection.getNearestPreviousItem("0.0.1");
        expect(nearestNextItem).to.equal(undefined);

        nearestNextItem = collection.getNearestPreviousItem("5.0.0");
        expect(nearestNextItem).to.equal("4.0.0");

        nearestNextItem = collection.getNearestPreviousItem("201.203.345");
        expect(nearestNextItem).to.equal("101.203.345");

        nearestNextItem = collection.getNearestPreviousItem("2.0.1");
        expect(nearestNextItem).to.equal("2.0.0");

        nearestNextItem = collection.getNearestPreviousItem("2.1.1");
        expect(nearestNextItem).to.equal("2.1.0");

        nearestNextItem = collection.getNearestNextItem("3.0.0");
        expect(nearestNextItem).to.equal("3.0.0");
    });

    it("should clone the sorted collection", function() {
        const clone = collection.clone();
        expect(clone instanceof SortedCollection).to.equal(true);
        expect(clone._sortedKeys)
            .to.eql(["1.1.0", "1.2.1", "1.10.5", "2.0.0", "2.1.0", "3.0.0", "4.0.0", "101.203.345"]);
    });
});
