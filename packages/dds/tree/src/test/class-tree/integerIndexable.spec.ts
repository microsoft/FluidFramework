/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { IntegerIndexable } from "../../class-tree/integerIndexable";

export class ArrayFake<T> extends IntegerIndexable<T> {
	public constructor(
		length: number,
		public value: T,
	) {
		super(length);
	}

	protected read(index: number): T {
		if (index < 0 || index >= this.length) {
			assert.fail("index out of bounds");
		}
		return this.value;
	}
	protected write(index: number, value: T): boolean {
		if (index < 0 || index >= this.length) {
			return false;
		}
		this.value = value;
		return true;
	}
}

describe("IntegerIndexable", () => {
	it("basic", () => {
		const x = new ArrayFake(5, 10);
		assert.equal(x.length, 5);
		assert.equal(x[3], 10);
		x[4] = 7;
		assert.equal(x[3], 7);
	});

	it("instanceof", () => {
		const x = new ArrayFake(5, 10);
		assert(x instanceof ArrayFake);
	});
});
