/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ChangeAtomId } from "../../../core/index.js";
import { SequenceField as SF } from "../../../feature-libraries/index.js";
import {
	areInputCellsEmpty,
	splitMark,
	tryMergeMarks,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/sequence-field/utils.js";
import { brand } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";
import { deepFreeze, testIdCompressor } from "../../utils.js";
import { generatePopulatedMarks } from "./populatedMarks.js";
import { describeForBothConfigs, withOrderingMethod } from "./utils.js";

const vestigialEndpoint: ChangeAtomId = {
	revision: testIdCompressor.generateCompressedId(),
	localId: brand(42),
};

export function testUtils() {
	describeForBothConfigs("Utils", (config) => {
		const withConfig = (fn: () => void) => withOrderingMethod(config.cellOrdering, fn);
		describe("round-trip splitMark and tryMergeMarks", () => {
			const marks = generatePopulatedMarks(testIdCompressor);
			[
				...marks,
				...marks
					.filter((mark) => !areInputCellsEmpty(mark))
					.map((mark) => ({ ...mark, vestigialEndpoint })),
			].forEach((mark, index) => {
				it(`${index}: ${"type" in mark ? mark.type : "NoOp"}`, () =>
					withConfig(() => {
						const splitable: SF.Mark<TestChange> = { ...mark, count: 3 };
						delete splitable.changes;
						deepFreeze(splitable);
						const [part1, part2] = splitMark(splitable, 2);
						const merged = tryMergeMarks(part1, part2);
						assert.deepEqual(merged, splitable);
					}));
			});
		});
	});
}
