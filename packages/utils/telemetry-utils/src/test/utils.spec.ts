/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { logIfFalse } from "../utils";
import { TelemetryDataTag, tagData } from "../logger";

class TestLogger implements ITelemetryBaseLogger {
	send(event: ITelemetryBaseEvent): void {
		this.events.push(event);
	}
	public readonly events: ITelemetryBaseEvent[] = [];
}

describe("logIfFalse", () => {
	it("logIfFalse undefined value is not undefined", () => {
		const logger = new TestLogger();
		const somthing: number | undefined = undefined;
		const val = logIfFalse(somthing !== undefined, logger, "it's undefined");
		assert.strictEqual(val, false);
		assert.strictEqual(logger.events.length, 1);
	});
	it("logIfFalse value is not undefined", () => {
		const logger = new TestLogger();
		const somthing: number | undefined = 1;
		const val = logIfFalse(somthing !== undefined, logger, "it's undefined");
		assert.strictEqual(val, true);
		assert.strictEqual(logger.events.length, 0);
	});
});

describe("tagData", () => {
	it("tagData", () => {
		const taggedData = tagData(TelemetryDataTag.CodeArtifact, { foo: "bar" });
		assert.deepStrictEqual(taggedData, {
			foo: {
				value: "bar",
				tag: TelemetryDataTag.CodeArtifact,
			},
		});
	});
});
