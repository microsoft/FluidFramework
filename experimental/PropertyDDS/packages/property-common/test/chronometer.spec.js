/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-unused-expressions */
/* eslint-disable max-nested-callbacks */
/**
 * @fileoverview In this file, we will test property-common.Chronometer
 */
(function() {

  const Chronometer = require('..').Chronometer;
  const sinon = require('sinon');

  describe('property-common.Chronometer', function() {
    it('should exist', function() {
      expect(Chronometer).to.exist;
    });

    describe('elapsed', function() {
      it('measures milliseconds', function(done) {
        var expectedResultMilliSec = 50;
        var chrono = new Chronometer();
        setTimeout(function() {
          chrono.stop();
          expect(chrono.elapsedSec()).to.be.at.most((expectedResultMilliSec + 500) / 1000);
          expect(chrono.elapsedMilliSec()).to.be.at.least(expectedResultMilliSec - 25);
          expect(chrono.elapsedMilliSec()).to.be.at.most(expectedResultMilliSec + 500);
          done();
        }, expectedResultMilliSec);
      });

      it('measures microseconds', function(done) {
        var expectedResultMilliSec = 10;
        var chrono = new Chronometer();
        setTimeout(function() {
          chrono.stop();
          expect(chrono.elapsedSec()).to.be.at.most((expectedResultMilliSec + 500) / 1000);
          expect(chrono.elapsedMicroSec()).to.be.at.least((expectedResultMilliSec - 25) * 1000);
          expect(chrono.elapsedMicroSec()).to.be.at.most((expectedResultMilliSec + 500) * 1000);
          done();
        }, expectedResultMilliSec);
      });

      it('@flaky measures seconds', function(done) {
        var expectedResultMilliSec = 100;
        var chrono = new Chronometer();
        setTimeout(function() {
          chrono.stop();
          expect(chrono.elapsedSec()).to.be.at.most(expectedResultMilliSec / 1000 + 50);
          expect(chrono.elapsedMilliSec()).to.be.at.most(expectedResultMilliSec + 50);
          done();
        }, 10);
      });

      it('times promises', function() {
        var clock = sinon.useFakeTimers();
        var expectedElapsedMilliSec = 50;
        var expectedResult = 199999;
        var resolve;
        var promise = new Promise((_resolve) => {resolve = _resolve});

        setTimeout(function() {
          resolve(expectedResult);
        }, expectedElapsedMilliSec);

        var expectations = Chronometer.timePromise(() => promise)
          .then(function(timedResult) {
            expect(timedResult.chrono.elapsedMilliSec()).to.be.at.least(expectedElapsedMilliSec - 5);
            expect(timedResult.chrono.elapsedMilliSec()).to.be.at.most(expectedElapsedMilliSec + 50);
            expect(timedResult.chrono.elapsedMicroSec()).to.be.at.least((expectedElapsedMilliSec - 5) * 1000);
            expect(timedResult.chrono.elapsedMicroSec()).to.be.at.most((expectedElapsedMilliSec + 50) * 1000);
            expect(timedResult.result).to.equal(expectedResult);
          })
          .then(function() {
            clock.restore();
          });

        clock.tick(expectedElapsedMilliSec + 1);

        return expectations;
      });

      it("@bugfix Cannot read property '0' of undefined", function(done) {
        var chrono = new Chronometer();
        // Prior to the bug fix, not stopping the chrono before measuring elapsed time
        // causes "Cannot read property '0' of undefined":
        expect(chrono.elapsedSec()).to.not.be.undefined;  // <-- chrono is not stopped

        chrono = new Chronometer();
        expect(chrono.elapsedMilliSec()).to.not.be.undefined;  // <-- chrono is not stopped

        chrono = new Chronometer();
        expect(chrono.elapsedMicroSec()).to.not.be.undefined;  // <-- chrono is not stopped

        done();
      });
    });
  });
})();
