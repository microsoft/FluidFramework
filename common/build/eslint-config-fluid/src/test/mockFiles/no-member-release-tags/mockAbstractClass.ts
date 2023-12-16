/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @public
 */
abstract class MockAbstractClass {
	abstract invalidMockMethod(): string;

	/**
	 * @alpha
	 */
	invalidMethod(): boolean {
		return true;
	}
}

/**
 * @beta
 */
class InvalidMockSubClass extends MockAbstractClass {
	/**
	 * @beta
	 * @returns string
	 */
	invalidMockMethod(): string {
		return "Hello World";
	}
}

const invalidMockSubClass = new InvalidMockSubClass();
invalidMockSubClass.invalidMethod();
invalidMockSubClass.invalidMockMethod();
