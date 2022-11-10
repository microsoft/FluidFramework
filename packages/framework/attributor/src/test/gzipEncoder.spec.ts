/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { makeGzipEncoder } from "../gzipEncoder";

describe("gzipEncoder", () => {
	const cases: { name: string; data: any; }[] = [
		{ name: "empty string", data: "" },
        { name: "numbers", data: 0 },
        { name: "objects", data: {} },
        { name: "empty lists", data: [] },
        { name: "null properties", data: { foo: null } },
        { name: "more complex objects", data: { foo: { bar: [1, 2] }, baz: 3, bat: 'hello' } },
	];

	describe("correctly round-trips", () => {
		for (const { name, data } of cases) {
			it(name, () => {
                const encoder = makeGzipEncoder<any>();
				const actual = encoder.decode(encoder.encode(data));
				assert.deepEqual(actual, data);
			});
		}
	});
});
