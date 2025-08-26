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
	TestRegularException,
	TestBaseSensitiveException,
} from "../lumberjackCommonTestUtils";
import { BaseSanitizationLumberFormatter } from "../sanitizationLumberFormatter";

describe("BaseSanitizationLumberFormatter", () => {
	it("Formatter goes through an exception without sensitive data and doesn't modify it.", () => {
		const errorMessage = "ErrorMessage";
		const engine = new TestEngine1();
		const regularException = new TestRegularException();
		const formatter = new BaseSanitizationLumberFormatter();
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
		const sensitiveException = new TestBaseSensitiveException();
		const formatter = new BaseSanitizationLumberFormatter();
		const lumber = new Lumber(LumberEventName.UnitTestEvent, resources.LumberType.Metric, [
			engine,
		]);

		lumber.error(errorMessage, sensitiveException);
		formatter.transform(lumber);

		const baseLumberException = lumber.exception as TestBaseSensitiveException;

		assert.strictEqual(baseLumberException.command.args[0], redactedStr);
		assert.strictEqual(baseLumberException.request.headers.authorization, redactedStr);
		assert.strictEqual(baseLumberException.response.request.headers.authorization, redactedStr);
	});
});
