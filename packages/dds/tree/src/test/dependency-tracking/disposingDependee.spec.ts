/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	DisposingDependee,
// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
} from "../../dependency-tracking/disposingDependee";
import {
    InvalidationToken,
	recordDependency,
	SimpleObservingDependent,
} from "../../dependency-tracking";

class MockDependent extends SimpleObservingDependent {
	public readonly tokens: (InvalidationToken | undefined)[] = [];
    public markInvalid(token?: InvalidationToken | undefined): void {
        this.tokens.push(token);
    }
}

describe("DisposingDependee", () => {
	it("unused", () => {
		const d = new DisposingDependee("test");
		assert(!d.isDisposed());
		let disposed = false;
		d.endInitialization((x) => {
			assert.equal(x, d);
			assert(!disposed);
			disposed = true;
		});
		// Confirm that calling endInitialization when there are no dependents disposes.
		assert(disposed);
		assert(d.isDisposed());
	});

	it("used", () => {
		const d = new DisposingDependee("test");
		const dependent = new MockDependent("dependent");
		const testToken = new InvalidationToken("token");
		recordDependency(dependent, d);
		assert(!d.isDisposed());
		assert.deepEqual(dependent.listDependees(), [d]);
		let disposed = false;
		d.endInitialization((x) => {
			assert.equal(x, d);
			assert(!disposed);
			disposed = true;
		});
		assert(!disposed);
		assert(!d.isDisposed());

		// Test invalidation propagates.
		dependent.markInvalid(testToken);
		assert.deepEqual(dependent.tokens, [testToken]);

		assert(!disposed);
		assert(!d.isDisposed());
		dependent.unregisterDependees();
		// Confirm dispose runs when last dependent is removed (after endInitialization)
		assert(disposed);
		assert(d.isDisposed());
	});

	it("used during initialization", () => {
		const d = new DisposingDependee("test");
		const dependent = new MockDependent("dependent");
		recordDependency(dependent, d);
		assert(!d.isDisposed());
		assert.deepEqual(dependent.listDependees(), [d]);
		dependent.unregisterDependees();
		let disposed = false;
		d.endInitialization((x) => {
			assert.equal(x, d);
			assert(!disposed);
			disposed = true;
		});
		// Confirm that calling endInitialization when there are no dependents remaining disposes.
		assert(disposed);
		assert(d.isDisposed());
	});
});
