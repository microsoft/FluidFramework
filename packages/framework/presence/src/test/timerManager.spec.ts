/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

import { describe, it, after, afterEach, before, beforeEach } from "mocha";
import { useFakeTimers, type SinonFakeTimers, spy } from "sinon";

import { TimerManager } from "../timerManager.js";

describe("TimerManager", () => {
	const initialTime = 1000;
	let clock: SinonFakeTimers;

	before(async () => {
		clock = useFakeTimers();
	});

	beforeEach(() => {
		clock.setSystemTime(initialTime);
	});

	afterEach(() => {
		clock.reset();
	});

	after(() => {
		clock.restore();
	});

	it("fires on time", () => {
		const timer = new TimerManager();
		const handler = spy(() => assert.strictEqual(Date.now(), 1100));
		timer.setTimeout(handler, 100);

		clock.tick(50);
		assert.strictEqual(handler.callCount, 0);
		assert.strictEqual(timer.hasExpired(), false);

		clock.tick(100);
		assert.strictEqual(handler.callCount, 1);
		assert.strictEqual(timer.hasExpired(), true);
	});

	it("expire time is based on timeout", () => {
		const timer = new TimerManager();
		const handler = spy(() => undefined);
		timer.setTimeout(handler, 50);

		assert.strictEqual(timer.expireTime, 1050);
		assert.strictEqual(timer.hasExpired(), false);
	});

	it("does not fire if cleared before timeout", () => {
		const timer = new TimerManager();
		const handler = spy(() => undefined);
		timer.setTimeout(handler, 100);

		clock.tick(50);
		timer.clearTimeout();

		assert.strictEqual(handler.callCount, 0);
		assert.strictEqual(timer.hasExpired(), true);
	});

	it("does not fire on old timeout when new timeout set", () => {
		const timer = new TimerManager();
		const handler = spy(() => assert.strictEqual(Date.now(), 1150));
		timer.setTimeout(handler, 100);
		assert.strictEqual(timer.expireTime, 1100);

		clock.tick(50);
		timer.setTimeout(handler, 100);
		assert.strictEqual(timer.expireTime, 1150);

		// advance to time 1120 - after the original timer should have fired, but before the new one.
		clock.tick(70);
		assert.strictEqual(handler.callCount, 0);

		// Advance past timeout
		clock.tick(50);

		assert.strictEqual(timer.hasExpired(), true);
		assert.strictEqual(handler.callCount, 1);
	});

	it("fires correctly on reuse", () => {
		const timer = new TimerManager();
		const handler = spy(() => assert(Date.now() === 1100));
		timer.setTimeout(handler, 100);

		clock.tick(200);
		const handler2 = spy(() => assert.strictEqual(Date.now(), 1300));
		timer.setTimeout(handler2, 100);

		clock.tick(200);
		assert.strictEqual(handler.callCount, 1);
		assert.strictEqual(handler2.callCount, 1);
	});

	it("multiple timers", () => {
		const timer = new TimerManager();
		const timer2 = new TimerManager();
		const handler = spy(() => {});
		const handler2 = spy(() => {});

		timer.setTimeout(handler, 100);
		timer2.setTimeout(handler2, 50);
		clock.tick(200);

		assert.strictEqual(handler.callCount, 1);
		assert.strictEqual(handler2.callCount, 1);
	});
});
