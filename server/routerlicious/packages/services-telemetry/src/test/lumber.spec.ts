/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import Sinon from "sinon";
import { Lumber } from "../lumber";
import { LumberEventName } from "../lumberEventNames";
import { LumberType } from "../resources";
import { TestEngine1, TestSchemaValidator } from "./lumberjackCommonTestUtils"


describe("Lumber", () => {
    beforeEach(() => {
        // use fake timers to have full control over the passage of time
        Sinon.useFakeTimers()
    });

    afterEach(() => {
        Sinon.restore();
    });

    it("Creates and completes Lumber with success.", () => {
        const expectedDuration = 100;
        const successMessage = "SuccessMessage";
        const engine = new TestEngine1();
        const engineStub = Sinon.stub(engine, "emit");
        const lumber = new Lumber(
            LumberEventName.UnitTestEvent,
            LumberType.Metric,
            [engine]);

        assert.strictEqual(lumber.successful, undefined);

        Sinon.clock.tick(expectedDuration);
        lumber.success(successMessage);

        assert.strictEqual(lumber.successful, true);
        assert.strictEqual(lumber.message, successMessage);
        assert.strictEqual(lumber.durationInMs, expectedDuration);
        assert.deepStrictEqual(engineStub.calledOnce, true);
    });

    it("Creates and completes Lumber with failure.", () => {
        const expectedDuration = 100;
        const errorMessage = "errorMessage";
        const engine = new TestEngine1();
        const engineStub = Sinon.stub(engine, "emit");
        const error = new Error("SampleError");
        const lumber = new Lumber(
            LumberEventName.UnitTestEvent,
            LumberType.Metric,
            [engine]);

        assert.strictEqual(lumber.successful, undefined);

        Sinon.clock.tick(expectedDuration);
        lumber.error(errorMessage, error);

        assert.strictEqual(lumber.successful, false);
        assert.strictEqual(lumber.message, errorMessage);
        assert.deepStrictEqual(lumber.exception, error);
        assert.strictEqual(lumber.durationInMs, expectedDuration);
        assert.deepStrictEqual(engineStub.calledOnce, true);
    });

    it("Adds individual properties to Lumber.", () => {
        const key1 = "key1";
        const value1 = "value1";
        const key2 = "key2";
        const value2 = "value2";
        const lumber = new Lumber(
            LumberEventName.UnitTestEvent,
            LumberType.Metric,
            []);

        lumber.setProperty(key1, value1)
              .setProperty(key2, value2);

        assert.strictEqual(lumber.properties.size, 2);
        assert.strictEqual(lumber.properties.has(key1), true);
        assert.strictEqual(lumber.properties.get(key1), value1);
        assert.strictEqual(lumber.properties.has(key2), true);
        assert.strictEqual(lumber.properties.get(key2), value2);
    });

    it("Adds properties to Lumber in a batch, with no existing properties in Lumber.", () => {
        const key1 = "key1";
        const value1 = "value1";
        const value2 = "value2";
        const mapProperties = new Map<string, any>();
        mapProperties.set(key1, value1);
        const recordProperties = {
            key2: value2,
        };
        const lumber = new Lumber(
            LumberEventName.UnitTestEvent,
            LumberType.Metric,
            []);

        lumber.setProperties(mapProperties);
        assert.strictEqual(lumber.properties.size, 1);
        assert.strictEqual(lumber.properties.has(key1), true);
        assert.strictEqual(lumber.properties.get(key1), value1);

        lumber.setProperties(recordProperties);
        assert.strictEqual(lumber.properties.size, 2);
        assert.strictEqual(lumber.properties.has("key2"), true);
        assert.strictEqual(lumber.properties.get("key2"), value2);
    });

    it("Adds properties to Lumber in a batch, with existing properties in Lumber.", () => {
        const key1 = "key1";
        const value1 = "value1";
        const value2 = "value2";
        const key3 = "key3";
        const value3 = "value3";
        const originalMapProperties = new Map<string, any>();
        originalMapProperties.set(key1, value1);
        const recordProperties = {
            key2: value2,
        };
        const extraMapProperties = new Map<string, any>();
        extraMapProperties.set(key3, value3);

        const lumber = new Lumber(
            LumberEventName.UnitTestEvent,
            LumberType.Metric,
            [],
            undefined,
            originalMapProperties);

        assert.strictEqual(lumber.properties.size, 1);
        assert.strictEqual(lumber.properties.has(key1), true);
        assert.strictEqual(lumber.properties.get(key1), value1);

        lumber.setProperties(recordProperties)
              .setProperties(extraMapProperties);

        assert.strictEqual(lumber.properties.size, 3);
        assert.strictEqual(lumber.properties.has("key2"), true);
        assert.strictEqual(lumber.properties.get("key2"), value2);
        assert.strictEqual(lumber.properties.has(key3), true);
        assert.strictEqual(lumber.properties.get(key3), value3);
    });

    it("Makes sure we cannot complete an already completed Lumber.", () => {
        const successMessage = "SuccessMessage";
        const engine = new TestEngine1();
        const engineStub = Sinon.stub(engine, "emit");
        const lumber = new Lumber(
            LumberEventName.UnitTestEvent,
            LumberType.Metric,
            [engine]);

        assert.strictEqual(lumber.successful, undefined);

        lumber.success(successMessage);

        assert.strictEqual(lumber.successful, true);

        try {
            lumber.success(successMessage);
        }
        catch (err) {
            assert.deepStrictEqual(engineStub.calledOnce, true);
            return;
        }

        assert.fail("Lumber should not be allowed to complete more than once.");
    });

    it("Makes sure we can complete Lumber if schema validation succeeds.", () => {
        const successMessage = "SuccessMessage";
        const engine = new TestEngine1();
        const lumber = new Lumber(
            LumberEventName.UnitTestEvent,
            LumberType.Metric,
            [engine],
            new TestSchemaValidator(true)); // Setting this as true to force validation to succeed

        assert.strictEqual(lumber.successful, undefined);

        try {
            lumber.success(successMessage);
        }
        catch (err) {
            assert.fail("Lumber should have been allowed to complete if schema validation succeeded.");
        }
    });

    it("Makes sure we cannot complete Lumber if schema validation fails.", () => {
        const successMessage = "SuccessMessage";
        const engine = new TestEngine1();
        const lumber = new Lumber(
            LumberEventName.UnitTestEvent,
            LumberType.Metric,
            [engine],
            new TestSchemaValidator(false)); // Setting this as false to force validation to fail

        assert.strictEqual(lumber.successful, undefined);

        try {
            lumber.success(successMessage);
        }
        catch (err) {
            return;
        }

        assert.fail("Lumber should not be allowed to complete if schema validation fails.");
    });
});
