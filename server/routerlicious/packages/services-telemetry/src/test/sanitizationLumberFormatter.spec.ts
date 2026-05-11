/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Lumber } from "../lumber";
import { LumberEventName } from "../lumberEventNames";
import * as resources from "../resources";
import {
	TestEngine1,
	TestSensitiveException,
	TestRegularException,
} from "../lumberjackCommonTestUtils";
import { SanitizationLumberFormatter } from "../sanitizationLumberFormatter";

describe("SanitizationLumberFormatter", () => {
	it("Formatter goes through an exception without sensitive data and doesn't modify it.", () => {
		const errorMessage = "ErrorMessage";
		const engine = new TestEngine1();
		const regularException = new TestRegularException();
		const formatter = new SanitizationLumberFormatter();
		const lumber = new Lumber(LumberEventName.UnitTestEvent, resources.LumberType.Metric, [
			engine,
		]);

		lumber.error(errorMessage, regularException);
		formatter.transform(lumber);

		assert.strictEqual(lumber.exception, regularException);
		assert.strictEqual(lumber.properties.size, 0);
	});

	it("Formatter goes through an exception with sensitive data and modifies it.", () => {
		const redactedStr = "[LUMBER_REDACTED]";
		const errorMessage = "ErrorMessage";
		const engine = new TestEngine1();
		const sensitiveException = new TestSensitiveException();
		const formatter = new SanitizationLumberFormatter();
		const lumber = new Lumber(LumberEventName.UnitTestEvent, resources.LumberType.Metric, [
			engine,
		]);

		lumber.error(errorMessage, sensitiveException);
		formatter.transform(lumber);

		const lumberException = lumber.exception as TestSensitiveException;
		const sensitiveKeys = lumber.properties.get("detectedSensitiveKeys") as Set<string>;

		assert.strictEqual(lumberException.password, redactedStr);
		assert.strictEqual(lumberException.apiKey, redactedStr);
		assert.strictEqual(lumberException.sessionId, redactedStr);
		assert.strictEqual(lumberException.cookie, redactedStr);
		assert.strictEqual(lumberException.token, redactedStr);
		assert.strictEqual(lumberException.secret, redactedStr);
		assert.strictEqual(lumberException.authorization, redactedStr);
		assert.strictEqual(lumberException.someProperty.pass, redactedStr);

		assert.strictEqual(sensitiveKeys.size, 8);
		assert.strictEqual(sensitiveKeys.has(".password"), true);
		assert.strictEqual(sensitiveKeys.has(".apiKey"), true);
		assert.strictEqual(sensitiveKeys.has(".sessionId"), true);
		assert.strictEqual(sensitiveKeys.has(".cookie"), true);
		assert.strictEqual(sensitiveKeys.has(".token"), true);
		assert.strictEqual(sensitiveKeys.has(".secret"), true);
		assert.strictEqual(sensitiveKeys.has(".authorization"), true);
		assert.strictEqual(sensitiveKeys.has(".someProperty.pass"), true);
	});
});
