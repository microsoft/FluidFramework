/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

// Allow importing from this specific file which is being tested:
import {
	loadSummary,
	encodeSummary,
	commitEncoderFromChangeEncoder,
} from "../../feature-libraries";

import { mintRevisionTag, SummaryData } from "../../core";
import { TestChange } from "../testChange";
import { brand } from "../../util";

describe("EditManagerIndex", () => {
	it("roundtrip", () => {
		const tag1 = mintRevisionTag();
		const tag2 = mintRevisionTag();
		const encoder = commitEncoderFromChangeEncoder(TestChange.encoder);
		const input: SummaryData<TestChange> = {
			trunk: [
				{
					revision: tag1,
					sessionId: "1",
					change: TestChange.mint([0], 1),
				},
				{
					revision: tag2,
					sessionId: "2",
					change: TestChange.mint([0, 1], 2),
				},
			],
			branches: new Map([
				[
					"3",
					{
						isDivergent: false,
						base: tag1,
						commits: [
							{
								sessionId: "3",
								revision: mintRevisionTag(),
								change: TestChange.mint([0], 3),
							},
						],
					},
				],
				[
					"4",
					{
						isDivergent: true,
						base: tag2,
						commits: [
							{
								sessionId: "4",
								revision: mintRevisionTag(),
								change: TestChange.mint([0, 1], 4),
							},
						],
					},
				],
			]),
			sequenceMap: new Map([
				[brand(1), tag1],
				[brand(2), tag2],
			]),
		};
		const s1 = encodeSummary(input, encoder);
		const output = loadSummary(s1, encoder);
		assert.deepEqual(output, input);
		const s2 = encodeSummary(output, encoder);
		assert.equal(s1, s2);
	});

	// TODO: testing EditManagerIndex class itself, specifically for attachment and normal summaries.
	// TODO: format compatibility tests to detect breaking of existing documents.
});
