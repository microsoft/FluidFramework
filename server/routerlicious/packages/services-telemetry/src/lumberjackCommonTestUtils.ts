/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumber } from "./lumber";
import { Lumberjack } from "./lumberjack";
import {
	ILumberjackEngine,
	ILumberjackSchemaValidator,
	ILumberjackSchemaValidationResult,
	ILumberFormatter,
} from "./resources";

// TestLumberjack allows us to run unit tests on Lumberjack by
// adding the reset() method
/**
 * @internal
 */
export class TestLumberjack extends Lumberjack {
	public static reset() {
		Lumberjack._instance = undefined;
	}
}

/**
 * @internal
 */
export class TestSchemaValidator implements ILumberjackSchemaValidator {
	constructor(private readonly passResult) {}
	public validate(props: Map<string, any>): ILumberjackSchemaValidationResult {
		return {
			validationPassed: this.passResult,
			validationFailedForProperties: [],
		};
	}
}

/**
 * @internal
 */
export class TestEngine1 implements ILumberjackEngine {
	public emit(lumber: Lumber) {}
}

/**
 * @internal
 */
export class TestEngine2 implements ILumberjackEngine {
	public emit(lumber: Lumber) {}
}

/**
 * @internal
 */
export class TestFormatter implements ILumberFormatter {
	public transform(lumber: Lumber) {}
}

export class TestSensitiveException extends Error {
	public password = "password";
	public apiKey = "apikey";
	public sessionId = "sessionid";
	public cookie = "cookie";
	public token = "token";
	public secret = "secret";
}

export class TestRegularException extends Error {
	public field1 = "field1";
	public field2 = "field2";
	public field3 = "field3";
	public field4 = "field4";
	public field5 = "field5";
	public field6 = "field6";
}
