/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview In this file, we will test property-common.Chronometer
 */

import { expect } from "chai";
import sinon from "sinon";

import { Chronometer } from "../chronometer";

describe("property-common.Chronometer", function () {
	it("should exist", function () {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		expect(Chronometer).to.exist;
	});

	describe("elapsed", function () {
		it("measures milliseconds", function (done) {
			const expectedResultMilliSec = 50;
			const chrono = new Chronometer();
			setTimeout(function () {
				chrono.stop();
				expect(chrono.elapsedSec()).to.be.at.most((expectedResultMilliSec + 500) / 1000);
				expect(chrono.elapsedMilliSec()).to.be.at.least(expectedResultMilliSec - 25);
				expect(chrono.elapsedMilliSec()).to.be.at.most(expectedResultMilliSec + 500);
				done();
			}, expectedResultMilliSec);
		});

		it("measures microseconds", function (done) {
			const expectedResultMilliSec = 10;
			const chrono = new Chronometer();
			setTimeout(function () {
				chrono.stop();
				expect(chrono.elapsedSec()).to.be.at.most((expectedResultMilliSec + 500) / 1000);
				expect(chrono.elapsedMicroSec()).to.be.at.least((expectedResultMilliSec - 25) * 1000);
				expect(chrono.elapsedMicroSec()).to.be.at.most((expectedResultMilliSec + 500) * 1000);
				done();
			}, expectedResultMilliSec);
		});

		it("@flaky measures seconds", function (done) {
			const expectedResultMilliSec = 100;
			const chrono = new Chronometer();
			setTimeout(function () {
				chrono.stop();
				expect(chrono.elapsedSec()).to.be.at.most(expectedResultMilliSec / 1000 + 50);
				expect(chrono.elapsedMilliSec()).to.be.at.most(expectedResultMilliSec + 50);
				done();
			}, 10);
		});

		it("times promises", async function () {
			const clock = sinon.useFakeTimers();
			const expectedElapsedMilliSec = 50;
			const expectedResult = 199999;
			let resolve;
			const promise = new Promise((_resolve) => {
				resolve = _resolve;
			});

			setTimeout(function () {
				resolve(expectedResult);
			}, expectedElapsedMilliSec);

			const expectations: Promise<void> = Chronometer.timePromise(async () => promise)
				.then(function (timedResult) {
					expect(timedResult.chrono.elapsedMilliSec()).to.be.at.least(
						expectedElapsedMilliSec - 5,
					);
					expect(timedResult.chrono.elapsedMilliSec()).to.be.at.most(
						expectedElapsedMilliSec + 50,
					);
					expect(timedResult.chrono.elapsedMicroSec()).to.be.at.least(
						(expectedElapsedMilliSec - 5) * 1000,
					);
					expect(timedResult.chrono.elapsedMicroSec()).to.be.at.most(
						(expectedElapsedMilliSec + 50) * 1000,
					);
					expect(timedResult.result).to.equal(expectedResult);
				})
				.then(function () {
					clock.restore();
				});

			clock.tick(expectedElapsedMilliSec + 1);

			return expectations;
		});

		it("@bugfix Cannot read property '0' of undefined", function (done) {
			let chrono = new Chronometer();
			// Prior to the bug fix, not stopping the chrono before measuring elapsed time
			// causes "Cannot read property '0' of undefined":
			expect(chrono.elapsedSec()).to.not.equal(undefined); // <-- chrono is not stopped

			chrono = new Chronometer();
			expect(chrono.elapsedMilliSec()).to.not.equal(undefined); // <-- chrono is not stopped

			chrono = new Chronometer();
			expect(chrono.elapsedMicroSec()).to.not.equal(undefined); // <-- chrono is not stopped

			done();
		});
	});
});
