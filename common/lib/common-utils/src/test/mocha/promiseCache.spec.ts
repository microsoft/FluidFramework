/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { SinonFakeTimers, useFakeTimers } from "sinon";

import { PromiseCache } from "../..";

describe("PromiseCache", () => {
	describe("Basic Cache Mechanism", () => {
		let pc: PromiseCache<number, string> | undefined;

		it("addOrGet", async () => {
			pc = new PromiseCache<number, string>();

			const contains_WhenAbsent = pc.has(1);
			assert.equal(contains_WhenAbsent, false);

			const get_WhenAbsent = pc.get(1);
			assert.equal(get_WhenAbsent, undefined);
			// eslint-disable-next-line @typescript-eslint/await-thenable
			assert.equal(await get_WhenAbsent, undefined);

			const remove_WhenAbsent = pc.remove(1);
			assert.equal(remove_WhenAbsent, false);

			const addOrGet_WhenAbsent = await pc.addOrGet(1, async () => "one");
			assert.equal(addOrGet_WhenAbsent, "one");

			const contains_WhenPresent = pc.has(1);
			assert.equal(contains_WhenPresent, true);

			const get_WhenPresent = await pc.get(1);
			assert.equal(get_WhenPresent, "one");

			const addOrGet_WhenPresent = await pc.addOrGet(1, async () => {
				// eslint-disable-next-line unicorn/error-message
				throw new Error();
			});
			assert.equal(addOrGet_WhenPresent, "one");

			const remove_WhenPresent = pc.remove(1);
			assert.equal(remove_WhenPresent, true);

			const get_AfterRemove = pc.get(1);
			assert.equal(get_AfterRemove, undefined);

			const contains_AfterRemove = pc.has(1);
			assert.equal(contains_AfterRemove, false);
		});

		it("addValueOrGet", async () => {
			pc = new PromiseCache<number, string>();

			const addValueOrGet_Result = await pc.addValueOrGet(1, "one");
			assert.equal(addValueOrGet_Result, "one");
		});

		it("add", async () => {
			pc = new PromiseCache<number, string>();

			const add_WhenAbsent = pc.add(1, async () => "one");
			assert.equal(add_WhenAbsent, true);

			const add_WhenPresent = pc.add(1, async () => {
				// eslint-disable-next-line unicorn/error-message
				throw new Error();
			});
			assert.equal(add_WhenPresent, false);

			const get_AfterAdd = await pc.get(1);
			assert.equal(get_AfterAdd, "one");
		});

		it("addValue", async () => {
			pc = new PromiseCache<number, string>();

			const addValue_Result = pc.addValue(1, "one");
			assert.equal(addValue_Result, true);

			const get_AfterAddValue = await pc.get(1);
			assert.equal(get_AfterAddValue, "one");
		});
	});

	describe("asyncFn behavior", () => {
		const thrower = async (removeOnError: boolean): Promise<string> => {
			throw new Error(removeOnError ? "remove" : "Don't remove");
		};

		const removeOnErrorByMessage = (error: Error): boolean => error.message === "remove";
		let pc: PromiseCache<number, string> | undefined;

		it("asyncFn run immediately and only if key not set", () => {
			pc = new PromiseCache<number, string>();

			let callCount = 0;
			const fn = async (): Promise<string> => {
				++callCount;
				return "hello!";
			};

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
			const asyncFn = async (): Promise<string> => thrower(false /* removeOnError */);

			const addOrGet1 = pc.addOrGet(1, asyncFn);
			await assert.rejects(addOrGet1);
			const contains1 = pc.has(1);
			assert.equal(contains1, true);
		});

		it("asyncFn throws: add, non-async, removeOnError=false", async () => {
			pc = new PromiseCache<number, string>({
				removeOnError: removeOnErrorByMessage,
			});
			const asyncFn = async (): Promise<string> => thrower(false /* removeOnError */);

			const add2 = pc.add(2, asyncFn);
			assert.equal(add2, true);
			const get2 = pc.get(2);
			if (get2 === undefined) {
				assert.fail();
			}
			await assert.rejects(get2);
		});

		it("asyncFn throws: addOrGet, async, removeOnError=false", async () => {
			pc = new PromiseCache<number, string>({
				removeOnError: removeOnErrorByMessage,
			});
			const asyncFn = async (): Promise<string> => thrower(false /* removeOnError */);

			const p3 = pc.addOrGet(3, asyncFn);
			await assert.rejects(p3);
			const contains3 = pc.has(3);
			assert.equal(contains3, true);
		});

		it("asyncFn throws: add, async, removeOnError=false", async () => {
			pc = new PromiseCache<number, string>({
				removeOnError: removeOnErrorByMessage,
			});
			const asyncFn = async (): Promise<string> => thrower(false /* removeOnError */);

			const add4 = pc.add(4, asyncFn);
			assert.equal(add4, true);
			const get4 = pc.get(4);
			if (get4 === undefined) {
				assert.fail();
			}
			await assert.rejects(get4);
		});

		it("asyncFn throws: addOrGet, non-async, removeOnError=true", async () => {
			pc = new PromiseCache<number, string>({
				removeOnError: removeOnErrorByMessage,
			});
			const asyncFn = async (): Promise<string> => thrower(true /* removeOnError */);

			const p5 = pc.addOrGet(5, asyncFn);
			const contains5a = pc.has(5);
			assert.equal(contains5a, true, "Shouldn't be removed yet; hasn't run yet");

			await assert.rejects(p5);
			const contains5b = pc.has(5);
			assert.equal(contains5b, false, "Should be removed after rejecting");
		});

		it("asyncFn throws: add, non-async, removeOnError=true", async () => {
			pc = new PromiseCache<number, string>({
				removeOnError: removeOnErrorByMessage,
			});
			const asyncFn = async (): Promise<string> => thrower(true /* removeOnError */);

			const add6 = pc.add(6, asyncFn);
			assert.equal(add6, true);
			const get6 = pc.get(6);
			if (get6 === undefined) {
				assert.fail("Shouldn't be removed yet; hasn't run yet");
			}

			await assert.rejects(get6);
			const contains6 = pc.has(6);
			assert.equal(contains6, false, "Should be removed after rejecting");
		});

		it("asyncFn throws: addOrGet, async, removeOnError=true", async () => {
			pc = new PromiseCache<number, string>({
				removeOnError: removeOnErrorByMessage,
			});
			const asyncFn = async (): Promise<string> => thrower(true /* removeOnError */);

			const p7 = pc.addOrGet(7, asyncFn);
			const contains7a = pc.has(7);
			assert.equal(contains7a, true, "Shouldn't be removed yet; hasn't run yet");

			await assert.rejects(p7);
			const contains7b = pc.has(7);
			assert.equal(contains7b, false, "Should be removed after rejecting");
		});

		it("asyncFn throws: add, async, removeOnError=true", async () => {
			pc = new PromiseCache<number, string>({
				removeOnError: removeOnErrorByMessage,
			});
			const asyncFn = async (): Promise<string> => thrower(true /* removeOnError */);

			const add8 = pc.add(8, asyncFn);
			assert.equal(add8, true);
			const get8 = pc.get(8);
			if (get8 === undefined) {
				assert.fail("Shouldn't be removed yet; hasn't run yet");
			}

			await assert.rejects(get8);
			const contains8 = pc.has(8);
			assert.equal(contains8, false, "Should be removed after rejecting");
		});
	});

	describe("Garbage Collection and Expiry", () => {
		let clock: SinonFakeTimers;
		let pc: PromiseCache<number, string> | undefined;

		// Useful for debugging the tests
		const enableLogging: boolean = false; // Set to true to see timing logs
		function logClock(m): void {
			if (enableLogging) {
				console.log(`${m} ${clock.now}`);
			}
		}

		before(() => {
			clock = useFakeTimers();
		});

		after(() => {
			clock.restore();
		});

		it("absolute expiry", async () => {
			pc = new PromiseCache<number, string>({
				expiry: { policy: "absolute", durationMs: 15 },
			});

			pc.addValue(1, "one");

			clock.tick(10);
			assert.equal(pc.has(1), true);

			await pc.addValueOrGet(1, "one");

			clock.tick(10);
			assert.equal(pc.has(1), false);
		});

		it("sliding expiry", async () => {
			const expiration = 15;
			pc = new PromiseCache<number, string>({
				expiry: { policy: "sliding", durationMs: expiration },
			});

			const startTime = clock.now;
			logClock("start");

			// Each of these operations should reset the sliding expiry
			pc.add(1, async () => "one");
			clock.tick(10);
			pc.addValue(1, "one");
			clock.tick(10);
			await pc.addOrGet(1, async () => "one");
			clock.tick(10);
			await pc.addValueOrGet(1, "one");
			clock.tick(10);
			await pc.get(1);
			clock.tick(10);

			const endTime = clock.now;
			logClock("endtime");

			// More than the initial expiry elapsed but the entry wasn't evicted
			assert.equal(endTime - startTime > expiration, true);
			assert.equal(pc.has(1), true);

			clock.tick(expiration);
			logClock("later");

			assert.equal(pc.has(1), false);
		});
	});
});
