/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { withDefaultBinaryEncoding } from "../../codec";
import { mintRevisionTag } from "../../core";
import { TestChange } from "../testChange";
import { brand } from "../../util";
import { SummaryData, parseSummary, stringifySummary } from "../../shared-tree-core";

describe("EditManagerSummarizer", () => {
	it("roundtrip", () => {
		const tag1 = mintRevisionTag();
		const tag2 = mintRevisionTag();
		const input: SummaryData<TestChange> = {
			trunk: [
				{
					revision: tag1,
					sessionId: "1",
					change: TestChange.mint([0], 1),
					sequenceNumber: brand(1),
				},
				{
					revision: tag2,
					sessionId: "2",
					change: TestChange.mint([0, 1], 2),
					sequenceNumber: brand(2),
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
		};
		const codec = withDefaultBinaryEncoding(TestChange.codec);
		const s1 = stringifySummary(input, codec);
		const output = parseSummary(s1, codec);
		assert.deepEqual(output, input);
		const s2 = stringifySummary(output, codec);
		assert.equal(s1, s2);
	});

	// TODO: testing EditManagerSummarizer class itself, specifically for attachment and normal summaries.
	// TODO: format compatibility tests to detect breaking of existing documents.
});
