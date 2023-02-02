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

import { MutableSummaryData, ReadonlySummaryData } from "../../core";
import { TestChange } from "../testChange";
import { brand } from "../../util";

describe("EditManagerIndex", () => {
	it("roundtrip", () => {
		const encoder = commitEncoderFromChangeEncoder(TestChange.encoder);
		const input: ReadonlySummaryData<TestChange> = {
			trunk: [
				{
					seqNumber: brand(1),
					refNumber: brand(0),
					sessionId: "1",
					changeset: TestChange.mint([0], 1),
				},
				{
					seqNumber: brand(2),
					refNumber: brand(1),
					sessionId: "2",
					changeset: TestChange.mint([0, 1], 2),
				},
			],
			branches: new Map([
				[
					"3",
					{
						isDivergent: false,
						refSeq: brand(0),
						localChanges: [
							{
								seqNumber: brand(3),
								refNumber: brand(0),
								sessionId: "3",
								changeset: TestChange.mint([0], 3),
							},
						],
					},
				],
				[
					"4",
					{
						isDivergent: true,
						refSeq: brand(1),
						localChanges: [
							{
								seqNumber: brand(4),
								refNumber: brand(1),
								sessionId: "4",
								changeset: TestChange.mint([0, 1], 4),
							},
						],
					},
				],
			]),
		};
		const output: MutableSummaryData<TestChange> = {
			trunk: [],
			branches: new Map([]),
		};
		const s1 = encodeSummary(input, encoder);
		loadSummary(s1, encoder, output);
		assert.deepEqual(output, input);
		const s2 = encodeSummary(output, encoder);
		assert.equal(s1, s2);
	});

	// TODO: testing EditManagerIndex class itself, specifically for attachment and normal summaries.
	// TODO: format compatibility tests to detect breaking of existing documents.
});
