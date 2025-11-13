/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ErasedTypeImplementation, type ErasedBaseType } from "../erasedType.js";

describe("erasedType", () => {
	it("ErasedBaseType", () => {
		interface Foo extends ErasedBaseType<"x"> {
			bar: number;
		}

		class FooInternal extends ErasedTypeImplementation<Foo> implements Foo {
			public readonly bar: number = 5;
			public readonly secret: string = "x";
			public constructor() {
				super();
			}
		}

		const f: Foo = new FooInternal();

		FooInternal.narrow(f);

		// f is now typed as FooInternal, which exposes access to "secret":
		const secret = f.secret;

		// Convert back to Foo:
		const foo = f.upCast();

		assert(foo instanceof FooInternal);

		// foo is now typed as FooInternal, which exposes access to "secret":
		const secret2 = foo.secret;

		assert.equal(foo, f);
		assert.equal(secret, "x");
		assert.equal(secret2, "x");
	});

	it("ErasedBaseType with constructor arguments", () => {
		interface Foo extends ErasedBaseType<"x"> {
			bar: number;
		}

		class FooInternal extends ErasedTypeImplementation<Foo> implements Foo {
			public readonly bar: number = 5;
			public readonly secret: string = "x";
			public constructor(x: number) {
				super();
			}
		}

		const f: Foo = new FooInternal(5);

		FooInternal.narrow(f);

		// f is now typed as FooInternal, which exposes access to "secret":
		const secret = f.secret;

		// Convert back to Foo:
		const foo = f.upCast();

		assert(foo instanceof FooInternal);

		// foo is now typed as FooInternal, which exposes access to "secret":
		const secret2 = foo.secret;

		assert.equal(foo, f);
		assert.equal(secret, "x");
		assert.equal(secret2, "x");
	});

	it("ErasedBaseType generic: covariant", () => {
		interface Foo<T> extends ErasedBaseType<["x", T]> {
			bar: number;
		}

		class FooInternal<T> extends ErasedTypeImplementation<Foo<T>> implements Foo<T> {
			public readonly bar: number = 5;
			public constructor(public readonly secret: T) {
				super();
			}
		}

		const f: Foo<string> = new FooInternal("x");

		FooInternal.narrow(f);

		// f is now typed as FooInternal, which exposes access to "secret":
		const secretX = f.secret;

		// Convert back to Foo:
		const foo = f.upCast();

		assert(foo instanceof FooInternal);

		// foo is now typed as FooInternal, which exposes access to "secret":
		const secret2 = foo.secret;

		assert.equal(foo, f);
		assert.equal(secretX, "x");
		assert.equal(secret2, "x");
	});

	it("ErasedBaseType private constructor", () => {
		interface Foo<T> extends ErasedBaseType<["x", T]> {
			bar: number;
		}

		class FooInternal<T> extends ErasedTypeImplementation<Foo<T>> implements Foo<T> {
			public readonly bar: number = 5;
			private constructor(public readonly secret: T) {
				super();
			}
			public static create<T>(secret: T): FooInternal<T> {
				return new FooInternal(secret);
			}
		}

		const f: Foo<string> = FooInternal.create("x");

		FooInternal.narrow(f);

		// f is now typed as FooInternal, which exposes access to "secret":
		const secretX = f.secret;

		// Convert back to Foo:
		const foo = f.upCast();

		assert(foo instanceof FooInternal);

		// foo is now typed as FooInternal, which exposes access to "secret":
		const secret2 = foo.secret;

		assert.equal(foo, f);
		assert.equal(secretX, "x");
		assert.equal(secret2, "x");
	});
});
