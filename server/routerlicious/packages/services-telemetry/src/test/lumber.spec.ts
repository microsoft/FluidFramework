/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import Sinon from "sinon";
import { Lumber } from "../lumber";
import { LumberEventName } from "../lumberEventNames";
import { LumberType } from "../resources";
import { sampleTelemetryMetadata, TestEngine } from "./lumberjackCommonTestUtils"


describe("Lumber", () => {
    beforeEach(() => {
        // use fake timers to have full control over the passage of time
        Sinon.useFakeTimers()
    });

    afterEach(() => {
        Sinon.restore();
    });

    it("Creates and completes Lumber with success", async () => {
        const expectedLatency = 100;
        const successMessage = "SuccessMessage";
        const statusCode = 200;
        const engine = new TestEngine();
        const engineStub = Sinon.stub(engine, "emit");
        const lumber = new Lumber(
            LumberEventName.UnitTestEvent,
            LumberType.Metric,
            [engine]);

        assert.strictEqual(lumber.successful, undefined);

        Sinon.clock.tick(expectedLatency);
        lumber.success(successMessage, statusCode, sampleTelemetryMetadata);

        assert.strictEqual(lumber.successful, true);
        assert.strictEqual(lumber.message, successMessage);
        assert.strictEqual(lumber.statusCode, statusCode.toString());
        assert.strictEqual(lumber.latencyInMs, expectedLatency);
        assert.deepStrictEqual(engineStub.calledOnce, true);
    });

    it("Creates and completes Lumber with failure", async () => {
        const expectedLatency = 100;
        const errorMessage = "errorMessage";
        const statusCode = 400;
        const engine = new TestEngine();
        const engineStub = Sinon.stub(engine, "emit");
        const error = new Error("SampleError");
        const lumber = new Lumber(
            LumberEventName.UnitTestEvent,
            LumberType.Metric,
            [engine]);

        assert.strictEqual(lumber.successful, undefined);

        Sinon.clock.tick(expectedLatency);
        lumber.error(errorMessage, statusCode, sampleTelemetryMetadata, error);

        assert.strictEqual(lumber.successful, false);
        assert.strictEqual(lumber.message, errorMessage);
        assert.strictEqual(lumber.statusCode, statusCode.toString());
        assert.deepStrictEqual(lumber.exception, error);
        assert.strictEqual(lumber.latencyInMs, expectedLatency);
        assert.deepStrictEqual(engineStub.calledOnce, true);
    });

    it("Adds properties to Lumber", async () => {
        const key = "AdditionalPropertyKey";
        const value = "AdditionalPropertyValue";
        const lumber = new Lumber(
            LumberEventName.UnitTestEvent,
            LumberType.Metric,
            []);

        lumber.addProperty(key, value);

        assert.strictEqual(lumber.properties.size, 1);
        assert.strictEqual(lumber.properties.has(key), true);
        assert.strictEqual(lumber.properties.get(key), value);
    });

    it("Makes sure we cannot complete an already completed Lumber", async () => {
        const expectedLatency = 100;
        const successMessage = "SuccessMessage";
        const statusCode = 200;
        const engine = new TestEngine();
        const engineStub = Sinon.stub(engine, "emit");
        const lumber = new Lumber(
            LumberEventName.UnitTestEvent,
            LumberType.Metric,
            [engine]);

        assert.strictEqual(lumber.successful, undefined);

        Sinon.clock.tick(expectedLatency);
        lumber.success(successMessage, statusCode, sampleTelemetryMetadata);

        assert.strictEqual(lumber.successful, true);

        try {
            lumber.success(successMessage, statusCode, sampleTelemetryMetadata);
        }
        catch (err) {
            assert.deepStrictEqual(engineStub.calledOnce, true);
            return;
        }

        assert.fail("Lumber should not be allowed to complete more than once.");

    });
});
