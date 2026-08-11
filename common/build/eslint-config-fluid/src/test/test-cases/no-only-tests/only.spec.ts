/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Fixture: each of the three .only() calls below should be flagged by the
 * `no-only-tests/no-only-tests` rule (3 violations total).
 */

describe.only("focused suite", () => {
	it.only("focused test", () => {});
	test.only("another focused test", () => {});
});
