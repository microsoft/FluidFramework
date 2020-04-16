/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { PromiseCache /*, PromiseCacheExpiry, PromiseCacheOptions*/ } from "../promiseRegistry";

describe("PromiseCache", () => {
    describe("Basic Cache Mechanism", () => {
        let pc: PromiseCache<number, string> | undefined;

        it("addOrGet", async () => {
            pc = new PromiseCache<number, string>();

            const contains_WhenAbsent = pc.contains(1);
            assert.equal(contains_WhenAbsent, false);

            const get_WhenAbsent = pc.get(1);
            assert.equal(get_WhenAbsent, undefined);

            const remove_WhenAbsent = pc.remove(1);
            assert.equal(remove_WhenAbsent, false);

            const addOrGet_WhenAbsent = await pc.addOrGet(
                1,
                async () => "one",
            );
            assert.equal(addOrGet_WhenAbsent, "one");

            const contains_WhenPresent = pc.contains(1);
            assert.equal(contains_WhenPresent, true);

            const get_WhenPresent = await pc.get(1);
            assert.equal(get_WhenPresent, "one");

            const addOrGet_WhenPresent = await pc.addOrGet(
                1,
                async () => "NOT one",
            );
            assert.equal(addOrGet_WhenPresent, "one");

            const remove_WhenPresent = pc.remove(1);
            assert.equal(remove_WhenPresent, true);

            const get_AfterRemove = pc.get(1);
            assert.equal(get_AfterRemove, undefined);

            const contains_AfterRemove = pc.contains(1);
            assert.equal(contains_AfterRemove, false);
        });

        it("addValueOrGet", async () => {
            pc = new PromiseCache<number, string>();

            const addValueOrGet_Result = await pc.addValueOrGet(
                1,
                "one",
            );
            assert.equal(addValueOrGet_Result, "one");
        });

        it("add", async () => {
            pc = new PromiseCache<number, string>();

            const add_WhenAbsent = pc.add(
                1,
                async () => "one",
            );
            assert.equal(add_WhenAbsent, true);

            const add_WhenPresent = pc.add(
                1,
                async () => "NOT one",
            );
            assert.equal(add_WhenPresent, false);

            const get_AfterAdd = await pc.get(1);
            assert.equal(get_AfterAdd, "one");
        });

        it("addValue", async () => {
            pc = new PromiseCache<number, string>();

            const addValue_Result = pc.addValue(
                1,
                "one",
            );
            assert.equal(addValue_Result, true);

            const get_AfterAddValue = await pc.get(1);
            assert.equal(get_AfterAddValue, "one");
        });
    });

    describe("asyncFn behavior", () => {
        // eslint-disable-next-line @typescript-eslint/promise-function-async
        const thrower = (removeOnError: boolean): Promise<string> => {
            throw new Error(removeOnError ? "remove" : "Don't remove");
        };

        const removeOnErrorByMessage = (error: Error) => error.message === "remove";
        let pc: PromiseCache<number, string> | undefined;

        it("asyncFn run immediately and only if key not set", () => {
            pc = new PromiseCache<number, string>();

            let callCount = 0;
            const fn = async () => { ++callCount; return "hello!"; };

            // fn runs immediately...
            pc.add(1, fn);
            assert.equal(callCount, 1);

            // ...but not if the key is already set...
            pc.add(1, fn);
            assert.equal(callCount, 1);

            // ...even if set by value
            callCount = 0;
            pc.addValue(2, "Some value");
            pc.add(2, fn);
            assert.equal(callCount, 0);
        });

        it("asyncFn throws: addOrGet, non-async, removeOnError=false", async () => {
            pc = new PromiseCache<number, string>({
                removeOnError: removeOnErrorByMessage,
            });
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            const asyncFn = () => thrower(false /*removeOnError*/);

            const addOrGet1 = pc.addOrGet(1, asyncFn);
            await assert.rejects(addOrGet1);
            const contains1 = pc.contains(1);
            assert.equal(contains1, true);
        });

        it("asyncFn throws: add, non-async, removeOnError=false", async () => {
            pc = new PromiseCache<number, string>({
                removeOnError: removeOnErrorByMessage,
            });
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            const asyncFn = () => thrower(false /*removeOnError*/);

            const add2 = pc.add(2, asyncFn);
            assert.equal(add2, true);
            const get2 = pc.get(2);
            if (get2 === undefined) { assert.fail(); }
            await assert.rejects(get2);
        });

        it("asyncFn throws: addOrGet, async, removeOnError=false", async () => {
            pc = new PromiseCache<number, string>({
                removeOnError: removeOnErrorByMessage,
            });
            const asyncFn = async () => thrower(false /*removeOnError*/);

            const p3 = pc.addOrGet(3, asyncFn);
            await assert.rejects(p3);
            const contains3 = pc.contains(3);
            assert.equal(contains3, true);
        });

        it("asyncFn throws: add, async, removeOnError=false", async () => {
            pc = new PromiseCache<number, string>({
                removeOnError: removeOnErrorByMessage,
            });
            const asyncFn = async () => thrower(false /*removeOnError*/);

            const add4 = pc.add(4, asyncFn);
            assert.equal(add4, true);
            const get4 = pc.get(4);
            if (get4 === undefined) { assert.fail(); }
            await assert.rejects(get4);
        });

        it("asyncFn throws: addOrGet, non-async, removeOnError=true", async () => {
            pc = new PromiseCache<number, string>({
                removeOnError: removeOnErrorByMessage,
            });
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            const asyncFn = () => thrower(true /*removeOnError*/);

            const p5 = pc.addOrGet(5, asyncFn);
            const contains5a = pc.contains(5);
            assert.equal(contains5a, true, "Shouldn't be removed yet; hasn't run yet");

            await assert.rejects(p5);
            const contains5b = pc.contains(5);
            assert.equal(contains5b, false, "Should be removed after rejecting");
        });

        it("asyncFn throws: add, non-async, removeOnError=true", async () => {
            pc = new PromiseCache<number, string>({
                removeOnError: removeOnErrorByMessage,
            });
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            const asyncFn = () => thrower(true /*removeOnError*/);

            const add6 = pc.add(6, asyncFn);
            assert.equal(add6, true);
            const get6 = pc.get(6);
            if (get6 === undefined) { assert.fail("Shouldn't be removed yet; hasn't run yet"); }

            await assert.rejects(get6);
            const contains6 = pc.contains(6);
            assert.equal(contains6, false, "Should be removed after rejecting");
        });

        it("asyncFn throws: addOrGet, async, removeOnError=true", async () => {
            pc = new PromiseCache<number, string>({
                removeOnError: removeOnErrorByMessage,
            });
            const asyncFn = async () => thrower(true /*removeOnError*/);

            const p7 = pc.addOrGet(7, asyncFn);
            const contains7a = pc.contains(7);
            assert.equal(contains7a, true, "Shouldn't be removed yet; hasn't run yet");

            await assert.rejects(p7);
            const contains7b = pc.contains(7);
            assert.equal(contains7b, false, "Should be removed after rejecting");
        });

        it("asyncFn throws: add, async, removeOnError=true", async () => {
            pc = new PromiseCache<number, string>({
                removeOnError: removeOnErrorByMessage,
            });
            const asyncFn = async () => thrower(true /*removeOnError*/);

            const add8 = pc.add(8, asyncFn);
            assert.equal(add8, true);
            const get8 = pc.get(8);
            if (get8 === undefined) { assert.fail("Shouldn't be removed yet; hasn't run yet"); }

            await assert.rejects(get8);
            const contains8 = pc.contains(8);
            assert.equal(contains8, false, "Should be removed after rejecting");
        });
    });

    describe.only("Garbage Collection and Expiry", () => {
        const delay = async (ms: number) => new Promise((res) => setTimeout(res, ms));
        let pc: PromiseCache<number, string> | undefined;

        it("absolute expiry", async () => {
            pc = new PromiseCache<number, string>({
                expiry: { policy: "absolute", durationMs: 10 },
            });

            pc.addValue(1, "one");

            await delay (5);
            assert.equal(pc.contains(1), true);

            await delay (20);
            assert.equal(pc.contains(1), false);
        });

        it.only("sliding expiry", async () => {
            const expirationDurationMs = 20;
            pc = new PromiseCache<number, string>({
                expiry: { policy: "sliding", durationMs: expirationDurationMs },
            });

            pc.addValue(1, "one");

            const startTime = new Date().getTime();
            await pc.get(1);
            await delay (10);
            await pc.get(1);
            await delay (10);
            await pc.get(1);
            await delay (10);
            await pc.get(1);
            const midTime = new Date().getTime();

            assert.equal(midTime - startTime > expirationDurationMs, true);
            assert.equal(pc.contains(1), true);

            pc.addValue(1, "one");
            await delay (100);
            pc.addValue(1, "one");
            await delay (100);
            pc.addValue(1, "one");
            await delay (100);
            pc.addValue(1, "one");
            const endTime = new Date().getTime();

            assert.equal(endTime - midTime > expirationDurationMs, true);
            assert.equal(pc.contains(1), true);

            await delay(100);
            assert.equal(pc.contains(1), false);
        });
    });

    describe("Async Wrapper Timing", () => {
        const asyncPromiseFn = async () => 1;
        // eslint-disable-next-line @typescript-eslint/promise-function-async
        const syncPromiseFn = () => Promise.resolve(2);
        const N = 1;

        it("asyncPromiseFn", async () => {
            for (let i = 0; i < N; i++) {
                await asyncPromiseFn();
            }
        });

        it("syncPromiseFn", async () => {
            for (let i = 0; i < N; i++) {
                await syncPromiseFn();
            }
        });

        it("asyncPromiseFn Wrapped", async () => {
            for (let i = 0; i < N; i++) {
                await (async () => asyncPromiseFn())();
            }
        });

        it("syncPromiseFn Wrapped", async () => {
            for (let i = 0; i < N; i++) {
                await (async () => syncPromiseFn())();
            }
        });

    });
});
