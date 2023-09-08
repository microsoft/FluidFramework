/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { logIfFalse } from "../utils";
import { TelemetryDataTag, tagCodeArtifacts, tagData } from "../logger";

class TestLogger implements ITelemetryBaseLogger {
	send(event: ITelemetryBaseEvent): void {
		this.events.push(event);
	}
	public readonly events: ITelemetryBaseEvent[] = [];
}

describe("logIfFalse", () => {
	it("logIfFalse undefined value is not undefined", () => {
		const logger = new TestLogger();
		const something: number | undefined = undefined;
		const val = logIfFalse(something !== undefined, logger, "it's undefined");
		assert.strictEqual(val, false);
		assert.strictEqual(logger.events.length, 1);
	});
	it("logIfFalse value is not undefined", () => {
		const logger = new TestLogger();
		const something: number | undefined = 1;
		const val = logIfFalse(something !== undefined, logger, "it's undefined");
		assert.strictEqual(val, true);
		assert.strictEqual(logger.events.length, 0);
	});
});

describe("tagData", () => {
	it("tagData with data", () => {
		const taggedData = tagData(TelemetryDataTag.CodeArtifact, { foo: "bar" });
		const expected: typeof taggedData = {
			foo: {
				value: "bar",
				tag: TelemetryDataTag.CodeArtifact,
			},
		};
		assert.deepStrictEqual(taggedData, expected);
	});
	it("tagData with undefined", () => {
		const taggedData = tagData(TelemetryDataTag.CodeArtifact, { none: undefined });
		const expected: Partial<typeof taggedData> = {};
		assert.deepStrictEqual(taggedData, expected);
	});

	it("tagData with complex object", () => {
		const taggedData = tagData(TelemetryDataTag.CodeArtifact, {
			foo: "bar",
			none: undefined,
			number: 0,
		});
		const expected: Partial<typeof taggedData> = {
			foo: {
				value: "bar",
				tag: TelemetryDataTag.CodeArtifact,
			},
			number: {
				value: 0,
				tag: TelemetryDataTag.CodeArtifact,
			},
		};

		assert.deepEqual(taggedData, expected);
	});
});

describe("tagCodeArtifacts", () => {
	it("tagCodeArtifacts with undefined", () => {
		const taggedData = tagCodeArtifacts({ node: undefined });
		const expected: Partial<typeof taggedData> = {};
		assert.deepStrictEqual(taggedData, expected, "undefined not tagged as expected");
	});

	it("tagCodeArtifacts with TelemetryBaseEventPropertyType properties", () => {
		const taggedData = tagCodeArtifacts({
			string: "foo",
			number: 0,
			boolean: true,
			none: undefined,
		});
		const expected: Partial<typeof taggedData> = {
			string: {
				value: "foo",
				tag: TelemetryDataTag.CodeArtifact,
			},
			number: {
				value: 0,
				tag: TelemetryDataTag.CodeArtifact,
			},
			boolean: {
				value: true,
				tag: TelemetryDataTag.CodeArtifact,
			},
		};
		assert.deepStrictEqual(
			taggedData,
			expected,
			"TelemetryBaseEventPropertyType not tagged as expected",
		);
	});

	it("tagCodeArtifacts with TelemetryBaseEventPropertyType getters", () => {
		const taggedData = tagCodeArtifacts({
			string: () => "foo",
			number: () => 0,
			boolean: () => true,
		});
		const stringValue = taggedData.string();
		const numberValue = taggedData.number();
		const booleanValue = taggedData.boolean();

		assert.deepStrictEqual(
			stringValue,
			{
				tag: TelemetryDataTag.CodeArtifact,
				value: "foo",
			},
			"string getter not tagged as expected",
		);
		assert.deepStrictEqual(
			numberValue,
			{
				tag: TelemetryDataTag.CodeArtifact,
				value: 0,
			},
			"number getter not tagged as expected",
		);
		assert.deepStrictEqual(
			booleanValue,
			{
				tag: TelemetryDataTag.CodeArtifact,
				value: true,
			},
			"boolean getter not tagged as expected",
		);
	});

	it("tagCodeArtifacts with both TelemetryBaseEventPropertyType properties and getters", () => {
		const expectedStringValue = {
			tag: TelemetryDataTag.CodeArtifact,
			value: "foo",
		};
		const expectedNumberValue = {
			tag: TelemetryDataTag.CodeArtifact,
			value: 0,
		};
		const expectedBooleanValue = {
			tag: TelemetryDataTag.CodeArtifact,
			value: true,
		};

		const taggedData = tagCodeArtifacts({
			string: "foo",
			number: 0,
			boolean: true,
			stringGetter: () => "foo",
			numberGetter: () => 0,
			booleanGetter: () => true,
		});

		// Validate basic properties are tagged.
		assert.deepStrictEqual(
			taggedData.string,
			expectedStringValue,
			"string property not tagged as expected",
		);
		assert.deepStrictEqual(
			taggedData.number,
			expectedNumberValue,
			"number property not tagged as expected",
		);
		assert.deepStrictEqual(
			taggedData.boolean,
			expectedBooleanValue,
			"boolean property not tagged as expected",
		);

		// Validate getters are tagged.
		const stringValue = taggedData.stringGetter();
		const numberValue = taggedData.numberGetter();
		const booleanValue = taggedData.booleanGetter();
		assert.deepStrictEqual(
			stringValue,
			expectedStringValue,
			"string getter not tagged as expected",
		);
		assert.deepStrictEqual(
			numberValue,
			expectedNumberValue,
			"number getter not tagged as expected",
		);
		assert.deepStrictEqual(
			booleanValue,
			expectedBooleanValue,
			"boolean getter not tagged as expected",
		);
	});
});
