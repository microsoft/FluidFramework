/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createIdCompressor } from "@fluidframework/id-compressor";
import { RevisionTagCodec } from "../../core/index.js";
import { SequenceField } from "../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import { generatePopulatedMarks } from "../feature-libraries/sequence-field/populatedMarks.js";
import { TestChange } from "../testChange.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "./snapshotTools.js";
import { sessionId } from "./testTrees.js";

describe("SequenceField - Snapshots", () => {
	useSnapshotDirectory("sequence-field");
	const idCompressor = createIdCompressor(sessionId);
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
					const encoded = codec.json.encode(changeset, idCompressor.localSessionId);
					takeJsonSnapshot(encoded);
				});
			});
		});
	}
});
