/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import Sinon from "sinon";
import { TestEngine1, TestEngine2, TestLumberjack } from "../lumberjackCommonTestUtils";
import { LumberEventName } from "../lumberEventNames";
import * as resources from "../resources";
import { getGlobalLumberjackInstance, setGlobalLumberjackInstance } from "../lumberjack";

describe("Lumberjack", () => {
	afterEach(() => {
		TestLumberjack.reset();
		Sinon.restore();
		setGlobalLumberjackInstance(undefined);
	});

	it("Sets up Lumberjack's global instance and creates a Lumber metric.", () => {
		const handleErrorStub = Sinon.stub(resources, "handleError");
		const engine = new TestEngine1();
		TestLumberjack.setup([engine]);
		TestLumberjack.newLumberMetric(LumberEventName.UnitTestEvent);
		assert.strictEqual(handleErrorStub.notCalled, true, "Handle error should not be called.");
	});

	it("Sets up a custom Lumberjack instance and creates a Lumber metric.", () => {
		const handleErrorStub = Sinon.stub(resources, "handleError");
		const engine = new TestEngine1();
		const customInstance = TestLumberjack.createInstance([engine]);
		customInstance.newLumberMetric(LumberEventName.UnitTestEvent);
		assert.strictEqual(handleErrorStub.notCalled, true, "Handle error should not be called.");
	});

	it("Setting up custom instance of Lumberjack should not interfere with the global instance.", () => {
		const handleErrorStub = Sinon.stub(resources, "handleError");
		const engine1 = new TestEngine1();
		const engine2 = new TestEngine2();
		TestLumberjack.setup([engine1]);
		TestLumberjack.createInstance([engine2]);
		assert.strictEqual(handleErrorStub.notCalled, true, "Handle error should not be called.");
	});

	it("An error should be logged when trying to setup Lumberjack more than once.", () => {
		const handleErrorStub = Sinon.stub(resources, "handleError");
		const engine1 = new TestEngine1();
		const engine2 = new TestEngine2();
		TestLumberjack.setup([engine1]);
		assert.strictEqual(handleErrorStub.notCalled, true, "Handle error should not be called.");
		TestLumberjack.setup([engine2]);
		assert.strictEqual(handleErrorStub.calledOnce, true, "Handle error should be called once.");
	});

	it("Lumberjack should fail when trying to use it with an empty engine list.", () => {
		const handleErrorStub = Sinon.stub(resources, "handleError");
		TestLumberjack.setup([]);
		assert.strictEqual(handleErrorStub.calledOnce, true, "Handle error should be called once.");
	});

	it("Lumberjack should fail when trying to create a metric before being properly set up.", () => {
		const handleErrorStub = Sinon.stub(resources, "handleError");
		TestLumberjack.newLumberMetric(LumberEventName.UnitTestEvent);
		assert.strictEqual(handleErrorStub.calledOnce, true, "Handle error should be called once.");
	});
});

describe("Global Lumberjack", () => {
	afterEach(() => {
		TestLumberjack.reset();
		Sinon.restore();
		setGlobalLumberjackInstance(undefined);
	});

	it("Sets up Lumberjack's global instance.", () => {
		const engine = new TestEngine1();
		const engine2 = new TestEngine2();
		const handleErrorStub = Sinon.stub(resources, "handleError");
		assert.strictEqual(
			undefined,
			getGlobalLumberjackInstance(),
			"Global instance should be undefined",
		);
		TestLumberjack.setup([engine], undefined, { enableGlobalTelemetryContext: true });
		assert(getGlobalLumberjackInstance(), "Global instance should be set");
		assert(TestLumberjack.isSetupCompleted(), "Setup should be completed");
		assert.strictEqual(handleErrorStub.notCalled, true, "Setup should not have caused errors");
		getGlobalLumberjackInstance().setup([engine2], undefined, {
			enableGlobalTelemetryContext: true,
		});
		assert.strictEqual(handleErrorStub.calledOnce, true, "setup should have caused an error");
	});
});
