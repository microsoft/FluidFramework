/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SessionId, createIdCompressor } from "@fluidframework/id-compressor";
import { ChangeAtomId } from "../../../core/index.js";
import { SequenceField as SF } from "../../../feature-libraries/index.js";
import {
	areInputCellsEmpty,
	splitMark,
	tryMergeMarks,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/sequence-field/utils.js";
import { brand } from "../../../util/index.js";
import { deepFreeze } from "../../utils.js";
import { TestChange } from "../../testChange.js";
import { generatePopulatedMarks } from "./populatedMarks.js";
import { describeForBothConfigs, withOrderingMethod } from "./utils.js";

const idCompressor = createIdCompressor("ca239bfe-7ce4-49dc-93a5-5e72ce8f089c" as SessionId);
const vestigialEndpoint: ChangeAtomId = {
	revision: idCompressor.generateCompressedId(),
	localId: brand(42),
};

describeForBothConfigs("SequenceField - Utils", (config) => {
	const withConfig = (fn: () => void) => withOrderingMethod(config.cellOrdering, fn);
	describe("round-trip splitMark and tryMergeMarks", () => {
		const marks = generatePopulatedMarks(idCompressor);
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
