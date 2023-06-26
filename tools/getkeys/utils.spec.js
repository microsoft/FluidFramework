/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// This is a test file, it's ok to import from devDependencies
// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it } from "mocha";
import { escapeString } from "./utils.js";

describe("escapeCharacters function", () => {

	it("Escapes double quotes correctly with default escape char", () => {
		const input = '{"a":{"b":{"c":"value1","d":"value2","e":0,"f":100}}}';
		const output = escapeString(input, ['"'])
		assert.equal(output, '"{\\"a\\":{\\"b\\":{\\"c\\":\\"value1\\",\\"d\\":\\"value2\\",\\"e\\":0,\\"f\\":100}}}"');
	});

	it("Escapes double quotes correctly with custom escape char", () => {
		const input = '{"a":{"b":{"c":"value1","d":"value2","e":0,"f":100}}}';
		const output = escapeString(input, ['"'], "|")
		assert.equal(output, '"{|"a|":{|"b|":{|"c|":|"value1|",|"d|":|"value2|",|"e|":0,|"f|":100}}}"');
	});

	it("Escapes double quotes and backticks correctly with default escape char", () => {
		const input = 'a"b`c';
		const output = escapeString(input, ['"', '`'])
		assert.equal(output, '"a\\"b\\`c"');
	});

	it("Escapes double quotes and backticks correctly with custom escape char", () => {
		const input = 'a"b`c';
		const output = escapeString(input, ['"', '`'], "|")
		assert.equal(output, '"a|"b|`c"');
	});
});
