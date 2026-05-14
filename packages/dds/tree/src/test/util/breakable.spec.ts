/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import {
	Breakable,
	type WithBreakable,
	throwIfBroken,
	breakingMethod,
	breakingClass,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../util/breakable.js";

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

		@breakingMethod
		public async canBreakAsync<T>(a: T, throwAfter?: Promise<unknown>): Promise<T> {
			if (throwAfter !== undefined) {
				await throwAfter;
				throw breakError;
			}
			return a;
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

		// Check ".cause" is set
		assert.throws(
			() => foo.canBreak(1),
			(error: Error) => {
				// TODO: remove cast when targeting ES2022 lib or later.
				assert.equal((error as { cause?: unknown }).cause, breakError);
				return true;
			},
		);
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

	describe("async", () => {
		it("resolves and preserves return value", async () => {
			const foo = new Foo();
			assert.equal(await foo.canBreakAsync(1), 1);
			// Still usable after a successful async run.
			assert.equal(foo.read(2), 2);
		});

		it("rejection breaks the breakable with the thrown error", async () => {
			const foo = new Foo();
			await assert.rejects(foo.canBreakAsync(1, Promise.resolve()), (error: Error) => {
				assert.equal(error, breakError);
				return true;
			});

			// Subsequent sync use should throw a UsageError citing the original break error.
			assert.throws(() => foo.read(1), validateUsageError(message));
			assert.throws(
				() => foo.canBreak(1),
				(error: Error) => {
					// TODO: remove cast when targeting ES2022 lib or later.
					assert.equal((error as { cause?: unknown }).cause, breakError);
					return true;
				},
			);
		});

		it("breaking externally during the await rejects with a UsageError and discards the value", async () => {
			const foo = new Foo();
			let resolveGate: () => void = () => {};
			const gate = new Promise<void>((resolve) => {
				resolveGate = resolve;
			});
			// Start an async run that will resolve cleanly once the gate is released.
			const inFlight = foo.breaker.run(async () => {
				await gate;
				return 42;
			});

			// While the async run is pending, break the breakable from another path.
			assert.throws(
				() => {
					foo.willBreak = true;
					foo.canBreak(1);
				},
				(error: Error) => {
					assert.equal(error, breakError);
					return true;
				},
			);

			// Allow the async work to finish; the resolve handler should detect the broken state and reject.
			resolveGate();
			await assert.rejects(
				inFlight,
				validateUsageError(
					`Foo was put into a broken state during an async operation.\nOriginal Error:\nError: BreakFoo`,
				),
			);
		});

		it("throws synchronously if already broken at run time without invoking breaker", () => {
			const foo = new Foo();
			foo.willBreak = true;
			assert.throws(() => foo.canBreak(1));

			let invoked = false;
			assert.throws(
				() =>
					foo.breaker.run(async () => {
						invoked = true;
						return 1;
					}),
				validateUsageError(message),
			);
			assert.equal(invoked, false);
		});
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
