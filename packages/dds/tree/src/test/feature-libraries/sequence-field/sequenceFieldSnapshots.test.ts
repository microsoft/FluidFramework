/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import { newChangeAtomIdTransform, RevisionTagCodec } from "../../../core/index.js";
import { SequenceField } from "../../../feature-libraries/index.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
import { TestNodeId } from "../../testNodeId.js";
import { createSnapshotCompressor, testIdCompressor } from "../../utils.js";
import { generatePopulatedMarks } from "./populatedMarks.js";
import { brand, newTupleBTree } from "../../../util/index.js";

export function testSnapshots(): void {
	describe("Snapshots", () => {
		const compressor = createSnapshotCompressor();
		const baseContext = {
			originatorId: compressor.localSessionId,
			revision: undefined,
			idCompressor: testIdCompressor,
		};

		const family = SequenceField.sequenceFieldChangeCodecFactory(
			new RevisionTagCodec(compressor),
		);
		const marks = generatePopulatedMarks(compressor);
		for (const version of family.getSupportedFormats()) {
			describe(`version ${version}`, () => {
				const dir = path.join("sequence-field", `V${version}`);
				useSnapshotDirectory(dir);
				const codec = family.resolve(version);
				for (const [index, mark] of marks.entries()) {
					it(`${index} - ${"type" in mark ? mark.type : "NoOp"}`, () => {
						const changeset = [mark];
						const encoded = codec.json.encode(changeset, {
							baseContext,
							encodeNode: (node) => TestNodeId.encode(node, baseContext),
							decodeNode: (node) => TestNodeId.decode(node, baseContext),
							rootNodeChanges: newTupleBTree(),
							rootRenames: newChangeAtomIdTransform(),
							getInputRootId: (id, count) => ({ start: id, value: id, length: count }),
							isAttachId: (id, count) => ({
								start: id,
								value: false,
								length: count,
							}),
							isDetachId: (id, count) => ({
								start: id,
								value: false,
								length: count,
							}),
							decodeRootNodeChange: () => {},
							decodeRootRename: () => {},
							decodeMoveAndDetach: () => {},
							generateId: () => ({ localId: brand(0) }),
						});
						takeJsonSnapshot(encoded);
					});
				}
			});
		}
	});
}
