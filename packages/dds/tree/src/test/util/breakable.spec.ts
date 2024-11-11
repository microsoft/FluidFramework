/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	Breakable,
	type WithBreakable,
	throwIfBroken,
	breakingMethod,
	breakingClass,
	// eslint-disable-next-line import/no-internal-modules
} from "../../util/breakable.js";
import { validateUsageError } from "../utils.js";

describe("Breakable", () => {
	const breakError = new Error("BreakFoo");
	class Foo implements WithBreakable {
		public readonly breaker: Breakable = new Breakable("Foo");

		public willBreak: boolean = false;

		@throwIfBroken
		public read(a: number): number {
			return a;
		}

		@throwIfBroken
		public readGeneric<T>(a: T): T {
			return a;
		}

		@breakingMethod
		public canBreak<T>(a: T): T {
			if (this.willBreak) {
				throw breakError;
			}
			return a;
		}

		@breakingMethod
		public canBreakReentrant<T>(a: T): T {
			return this.canBreak(a);
		}
	}

	const message = `Invalid use of Foo after it was put into an invalid state by another error.
Original Error:
Error: BreakFoo`;

	it("basic use", () => {
		const foo = new Foo();

		// Ensure wrapper preserves return value and arguments.
		assert.equal(foo.read(1), 1);
		assert.equal(foo.canBreak(1), 1);

		foo.willBreak = true;

		assert.throws(
			() => foo.canBreak(1),
			(error: Error) => {
				assert.equal(error, breakError);
				return true;
			},
		);

		assert.throws(() => foo.read(1), validateUsageError(message));
		assert.throws(() => foo.canBreak(1), validateUsageError(message));
	});

	it("reentrant", () => {
		const foo = new Foo();
		foo.willBreak = true;

		// Ensure outer catch rethrows original error not usage error
		assert.throws(
			() => foo.canBreakReentrant(1),
			(error: Error) => {
				assert.equal(error, breakError);
				return true;
			},
		);
	});

	class Base {
		public baseRead(a: number): number {
			return a;
		}

		// overridden, should not run
		public read(a: number): number {
			throw new Error("overridden");
		}
	}

	@breakingClass
	class Foo2 extends Base implements WithBreakable {
		public readonly breaker: Breakable = new Breakable("Foo");

		public willBreak: boolean = false;

		@throwIfBroken
		public override read(a: number): number {
			return a;
		}

		public canBreak<T>(a: T): T {
			if (this.willBreak) {
				throw breakError;
			}
			return a;
		}
	}

	it("breakingClass", () => {
		const foo = new Foo2();

		// Ensure wrapper preserves return value and arguments.
		assert.equal(foo.read(1), 1);
		assert.equal(foo.canBreak(1), 1);
		assert.equal(foo.baseRead(1), 1);

		foo.willBreak = true;

		assert.throws(
			() => foo.canBreak(1),
			(error: Error) => {
				assert.equal(error, breakError);
				return true;
			},
		);

		assert.throws(() => foo.read(1), validateUsageError(message));
		assert.throws(() => foo.canBreak(1), validateUsageError(message));
		assert.throws(() => foo.baseRead(1), validateUsageError(message));
	});
});
