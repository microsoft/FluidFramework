/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SequenceField } from "../../feature-libraries";
import { RevisionTagCodec } from "../../shared-tree-core";
import { useDeterministicStableId } from "../../util";
// eslint-disable-next-line import/no-internal-modules
import { generatePopulatedMarks } from "../feature-libraries/sequence-field/populatedMarks";
import { TestChange } from "../testChange";
import { takeJsonSnapshot, useSnapshotDirectory } from "./snapshotTools";

describe("SequenceField - Snapshots", () => {
	useSnapshotDirectory("sequence-field");
	const family = SequenceField.sequenceFieldChangeCodecFactory(
		TestChange.codec,
		new RevisionTagCodec(),
	);
	for (const version of family.getSupportedFormats()) {
		describe(`version ${version}`, () => {
			const codec = family.resolve(version);
			useDeterministicStableId(() => {
				generatePopulatedMarks().forEach((mark, index) => {
					it(`${index} - ${"type" in mark ? mark.type : "NoOp"}`, () => {
						const changeset = [mark];
						const encoded = codec.json.encode(changeset);
						takeJsonSnapshot(encoded);
					});
				});
			});
		});
	}
});
