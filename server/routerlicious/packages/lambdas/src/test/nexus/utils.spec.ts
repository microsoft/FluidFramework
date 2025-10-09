/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import sinon from "sinon";
import { ExpirationTimer } from "../../nexus/utils";

describe("Routerlicious", () => {
	describe("Nexus", () => {
		describe("ExpirationTimer", () => {
			let clock: sinon.SinonFakeTimers;

			beforeEach(() => {
				clock = sinon.useFakeTimers();
			});

			afterEach(() => {
				clock.restore();
			});

			it("should call onTimeout after the specified time", () => {
				const onTimeout = sinon.fake();
				const timer = new ExpirationTimer(onTimeout);

				timer.set(1000);
				clock.tick(999);
				assert.equal(
					onTimeout.callCount,
					0,
					"onTimeout should not be called before expiration",
				);

				clock.tick(1);
				assert.equal(onTimeout.callCount, 1, "onTimeout should be called at expiration");
			});

			it("should not call onTimeout if cleared before expiration", () => {
				const onTimeout = sinon.fake();
				const timer = new ExpirationTimer(onTimeout);

				timer.set(1000);
				clock.tick(500);
				timer.clear();
				clock.tick(1000);
				assert.equal(onTimeout.callCount, 0, "onTimeout should not be called after clear");
			});

			it("should not call onTimeout if paused before expiration", () => {
				const onTimeout = sinon.fake();
				const timer = new ExpirationTimer(onTimeout);

				timer.set(1000);
				clock.tick(500);
				timer.pause();
				clock.tick(1000);
				assert.equal(onTimeout.callCount, 0, "onTimeout should not be called while paused");
			});

			it("should call onTimeout after resume, respecting total active time", () => {
				const onTimeout = sinon.fake();
				const timer = new ExpirationTimer(onTimeout);

				timer.set(1000);
				clock.tick(400);
				timer.pause();
				clock.tick(1000); // Should not trigger timeout while paused
				assert.equal(onTimeout.callCount, 0, "onTimeout should not be called while paused");

				timer.resume();
				clock.tick(599);
				assert.equal(
					onTimeout.callCount,
					0,
					"onTimeout should not be called before remaining time",
				);

				clock.tick(1);
				assert.equal(
					onTimeout.callCount,
					1,
					"onTimeout should be called after total active time",
				);
			});

			it("should not call onTimeout if cleared after pause and before resume", () => {
				const onTimeout = sinon.fake();
				const timer = new ExpirationTimer(onTimeout);

				timer.set(1000);
				clock.tick(400);
				timer.pause();
				timer.clear();
				timer.resume();
				clock.tick(1000);
				assert.equal(
					onTimeout.callCount,
					0,
					"onTimeout should not be called after clear and resume",
				);
			});
		});
	});
});
