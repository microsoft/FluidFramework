/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ChangeAtomId } from "../../../core/index.js";
import type { SequenceField as SF } from "../../../feature-libraries/index.js";
import {
	areInputCellsEmpty,
	splitMark,
	tryMergeMarks,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/sequence-field/utils.js";
import { brand } from "../../../util/index.js";
import { testIdCompressor } from "../../utils.js";
import { generatePopulatedMarks } from "./populatedMarks.js";
import { deepFreeze } from "@fluidframework/test-runtime-utils/internal";

const vestigialEndpoint: ChangeAtomId = {
	revision: testIdCompressor.generateCompressedId(),
	localId: brand(42),
};

export function testUtils() {
	describe("Utils", () => {
		describe("round-trip splitMark and tryMergeMarks", () => {
			const marks = generatePopulatedMarks(testIdCompressor);
			[
				...marks,
				...marks
					.filter((mark) => !areInputCellsEmpty(mark))
					.map((mark) => ({ ...mark, vestigialEndpoint })),
			].forEach((mark, index) => {
				it(`${index}: ${"type" in mark ? mark.type : "NoOp"}`, () => {
					const splitable: SF.Mark = { ...mark, count: 3 };
					delete splitable.changes;
					deepFreeze(splitable);
					const [part1, part2] = splitMark(splitable, 2);
					const merged = tryMergeMarks(part1, part2);
					assert.deepEqual(merged, splitable);
				});
			});
		});
	});
}
