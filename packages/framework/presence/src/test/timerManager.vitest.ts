/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { describe, it, afterAll, afterEach, beforeAll, beforeEach, expect, vi } from "vitest";

import { TimerManager } from "../presenceDatastoreManager.js";

describe("TimerManager", () => {
	const initialTime = 1000;

	beforeAll(async () => {
		vi.useFakeTimers();
	});

	beforeEach(() => {
		vi.setSystemTime(initialTime);
	});

	afterEach(() => {
		vi.clearAllTimers();
	});

	afterAll(() => {
		vi.useRealTimers();
	});

	it("fires on time", () => {
		const timer = new TimerManager();
		const handler = vi.fn(() => expect(Date.now()).toEqual(1100));
		timer.setTimeout(handler, 100);

		vi.advanceTimersByTime(50);
		expect(handler).not.toHaveBeenCalled();
		expect(timer.hasExpired()).toEqual(false);

		vi.advanceTimersByTime(100);
		expect(handler).toHaveBeenCalledOnce();
		expect(timer.hasExpired()).toEqual(true);
	});

	it("expire time is based on timeout", () => {
		const timer = new TimerManager();
		const handler = vi.fn(() => undefined);
		timer.setTimeout(handler, 50);

		expect(timer.expireTime).toEqual(1050);
		expect(timer.hasExpired()).toEqual(false);
	});

	it("does not fire if cleared before timeout", () => {
		const timer = new TimerManager();
		const handler = vi.fn(() => undefined);
		timer.setTimeout(handler, 100);

		vi.advanceTimersByTime(50);
		timer.clearTimeout();

		expect(handler).not.toHaveBeenCalled();
		expect(timer.hasExpired()).toEqual(true);
	});

	it("does not fire on old timeout when new timeout set", () => {
		const timer = new TimerManager();
		const handler = vi.fn(() => expect(Date.now()).toEqual(1150));
		timer.setTimeout(handler, 100);
		expect(timer.expireTime).toEqual(1100);

		vi.advanceTimersByTime(50);
		timer.setTimeout(handler, 100);
		expect(timer.expireTime).toEqual(1150);

		// advance to time 1120 - after the original timer should have fired, but before the new one.
		vi.advanceTimersByTime(70);
		expect(handler).not.toHaveBeenCalled();

		// Advance past timeout
		vi.advanceTimersByTime(50);

		expect(timer.hasExpired()).toEqual(true);
		expect(handler).toHaveBeenCalledOnce();
	});

	it("fires correctly on reuse", () => {
		const timer = new TimerManager();
		const handler = vi.fn(() => expect(Date.now()).toEqual(1100));
		timer.setTimeout(handler, 100);

		vi.advanceTimersByTime(200);
		const handler2 = vi.fn(() => expect(Date.now()).toEqual(1300));
		timer.setTimeout(handler2, 100);

		vi.advanceTimersByTime(200);
		expect(handler).toHaveBeenCalledOnce();
		expect(handler2).toHaveBeenCalledOnce();
	});

	it("multiple timers", () => {
		const timer = new TimerManager();
		const timer2 = new TimerManager();
		const handler = vi.fn(() => {});

		timer.setTimeout(handler, 100);
		timer2.setTimeout(handler, 50);
		vi.advanceTimersByTime(200);

		expect(handler).toHaveBeenCalledTimes(2);
	});
});
