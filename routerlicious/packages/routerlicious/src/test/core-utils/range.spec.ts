import * as utils from "@prague/client-api";
import * as assert from "assert";
import { assertThrows } from "../testUtils";

describe("Core-Utils", () => {
    describe("Range", () => {
        let range: utils.Range;

        beforeEach(() => {
            range = new utils.Range();
        });

        describe("#intersect", () => {
            it("Should be able to intersect two ranges", () => {
                const first = new utils.Range(10, 30);
                const second = new utils.Range(20, 25);
                const third = new utils.Range(45, 55);

                assert.deepEqual(utils.Range.intersect(first, second), new utils.Range(20, 25));
                assert.ok(utils.Range.intersect(first, third).empty);
            });
        });

        describe("#union", () => {
            it("Should be able to union two Ranges", () => {
                const first = new utils.Range(10, 30);
                const second = new utils.Range(50, 60);

                assert.deepEqual(first, utils.Range.union(first, range));
                assert.deepEqual(utils.Range.union(first, range), first);
                assert.deepEqual(utils.Range.union(first, second), new utils.Range(10, 60));
            });
        });

        describe(".head", () => {
            it("Should be able to set and get the head", () => {
                assert.equal(range.head, Number.NEGATIVE_INFINITY);
                range.head = 10;
                assert.equal(range.head, 10);
            });

            it("Should only be able to set increasing head values", () => {
                range.head = 10;
                assertThrows(() => range.head = 5);
            });
        });

        describe(".tail", () => {
            beforeEach(() => {
                range.head = 10;
            });

            it("Should be able to set and get the tail", () => {
                assert.equal(range.tail, Number.NEGATIVE_INFINITY);
                range.tail = 5;
                assert.equal(range.tail, 5);
            });

            it("Should only be able to set increasing tail values", () => {
                range.tail = 5;
                assertThrows(() => range.tail = 3);
            });

            it("Should only be able to set a tail less than the head", () => {
                assertThrows(() => range.tail = 20);
            });
        });

        describe(".empty", () => {
            it("Should return true when head and tail are equal", () => {
                range.head = 10;
                range.tail = 10;
                assert.ok(range.empty);
            });

            it("Should return false when head and tail are not-equal", () => {
                assert.ok(range.empty);
                range.head = 100;
                range.tail = 5;
                assert.ok(!range.empty);
            });
        });
    });
});
