/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createIdCompressor } from "@fluidframework/id-compressor";
import { RevisionTagCodec } from "../../../core/index.js";
import { SequenceField } from "../../../feature-libraries/index.js";
import { TestChange } from "../../testChange.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
import { testSessionId } from "../../utils.js";
import { generatePopulatedMarks } from "./populatedMarks.js";

export function testSnapshots() {
	describe("Snapshots", () => {
		useSnapshotDirectory("sequence-field");
		const idCompressor = createIdCompressor(testSessionId);
		const family = SequenceField.sequenceFieldChangeCodecFactory(
			TestChange.codec,
			new RevisionTagCodec(idCompressor),
		);
		const marks = generatePopulatedMarks(idCompressor);
		idCompressor.finalizeCreationRange(idCompressor.takeNextCreationRange());
		for (const version of family.getSupportedFormats()) {
			describe(`version ${version}`, () => {
				const codec = family.resolve(version);
				marks.forEach((mark, index) => {
					it(`${index} - ${"type" in mark ? mark.type : "NoOp"}`, () => {
						const changeset = [mark];
						const encoded = codec.json.encode(changeset, {
							originatorId: idCompressor.localSessionId,
						});
						takeJsonSnapshot(encoded);
					});
				});
			});
		}
	});
}
