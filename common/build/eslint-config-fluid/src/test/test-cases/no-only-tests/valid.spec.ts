/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Fixture: none of these calls use .only(), so no violations should be reported
 * by the `no-only-tests/no-only-tests` rule.
 */

describe("normal suite", () => {
	it("a passing test", () => {});
	test("another passing test", () => {});
});
