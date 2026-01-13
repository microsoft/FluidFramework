/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	type ChangesetLocalId,
	DetachedFieldIndex,
	type ForestRootId,
	type RevisionTag,
	type TaggedChange,
	TreeStoredSchemaRepository,
	mapCursorField,
	rootFieldKey,
	tagChange,
} from "../../core/index.js";
import { cursorToJsonObject, fieldJsonCursor } from "../json/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { optional } from "../../feature-libraries/default-schema/defaultFieldKinds.js";
import {
	DefaultEditBuilder,
	DefaultRevisionReplacer,
	ModularChangeFamily,
	type ModularChangeset,
	ModularEditBuilder,
	type TreeChunk,
	fieldKinds,
} from "../../feature-libraries/index.js";
import {
	SharedTreeChangeEnricher,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../shared-tree/sharedTreeChangeEnricher.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { SharedTreeChange } from "../../shared-tree/sharedTreeChangeTypes.js";
import {
	type IdAllocator,
	type JsonCompatible,
	brand,
	disposeSymbol,
	idAllocatorFromMaxId,
} from "../../util/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { Change } from "../feature-libraries/optional-field/optionalFieldUtils.js";
import {
	buildTestForest,
	failCodecFamily,
	jsonTreeFromForest,
	mintRevisionTag,
	testIdCompressor,
	testRevisionTagCodec,
} from "../utils.js";
import { FluidClientVersion } from "../../codec/index.js";
import { jsonSequenceRootSchema } from "../sequenceRootUtils.js";
import { initializeForest } from "../feature-libraries/index.js";

const content: JsonCompatible = { x: 42 };

const codecOptions = {
	jsonValidator: FormatValidatorBasic,
	minVersionForCollab: FluidClientVersion.v2_0,
};
const modularFamily = new ModularChangeFamily(fieldKinds, failCodecFamily, codecOptions);

const dataChanges: ModularChangeset[] = [];
const defaultEditor = new DefaultEditBuilder(
	modularFamily,
	mintRevisionTag,
	(taggedChange) => dataChanges.push(taggedChange.change),
	codecOptions,
);
const modularBuilder = new ModularEditBuilder(
	modularFamily,
	modularFamily.fieldKinds,
	() => {},
	codecOptions,
);

// Side effects results in `dataChanges` being populated
defaultEditor.optionalField({ parent: undefined, field: rootFieldKey }).set(undefined, false);

const removeRoot: SharedTreeChange = {
	changes: [
		{ type: "data", innerChange: dataChanges.at(0) ?? assert.fail("Expected change") },
	],
};

const revision1 = testIdCompressor.generateCompressedId();

export function setupEnricher() {
	const removedRoots = new DetachedFieldIndex(
		"test",
		idAllocatorFromMaxId() as IdAllocator<ForestRootId>,
		testRevisionTagCodec,
		testIdCompressor,
		{ jsonValidator: FormatValidatorBasic, minVersionForCollab: FluidClientVersion.v2_0 },
	);
	const schema = new TreeStoredSchemaRepository(jsonSequenceRootSchema);
	const forest = buildTestForest({ additionalAsserts: true, schema });
	initializeForest(forest, fieldJsonCursor([content]), testRevisionTagCodec, testIdCompressor);
	const enricher = new SharedTreeChangeEnricher(forest, removedRoots, schema);
	return { forest, removedRoots, enricher };
}

describe("SharedTreeChangeEnricher", () => {
	it("updates enrichments", () => {
		const { enricher, forest, removedRoots } = setupEnricher();
		const tag = mintRevisionTag();
		const removeRoot2: SharedTreeChange = {
			changes: [
				{
					type: "data",
					innerChange: tagChangeInLine(
						dataChanges.at(0) ?? assert.fail("Expected change"),
						tag,
					).change,
				},
			],
		};

		assert.deepEqual(jsonTreeFromForest(forest), [content]);
		assert.deepEqual([...removedRoots.entries()], []);
		enricher.applyTipChange(removeRoot2, tag);

		const tagForRestore = mintRevisionTag();
		const restore = Change.atOnce(
			Change.reserve("self", { localId: brand(0), revision: tagForRestore }),
			Change.move({ localId: brand(0), revision: tag }, "self"),
		);
		const restoreRoot: SharedTreeChange = {
			changes: [
				{
					type: "data",
					innerChange: modularBuilder.buildChanges([
						{
							type: "field",
							field: { parent: undefined, field: rootFieldKey },
							fieldKind: optional.identifier,
							change: brand(restore),
							revision: tagForRestore,
						},
					]),
				},
			],
		};

		const enriched = enricher.updateChangeEnrichments(restoreRoot);

		// Check that the forest and removed roots were not mutated
		assert.deepEqual(jsonTreeFromForest(forest), [content]);
		assert.deepEqual([...removedRoots.entries()], []);

		// Check that the original change was not modified
		assert.equal(restoreRoot.changes[0].type, "data");
		assert.equal(restoreRoot.changes[0].innerChange.refreshers, undefined);

		// Check that the enriched change now sports the adequate refresher
		assert.equal(enriched.changes[0].type, "data");
		assert.equal(enriched.changes[0].innerChange.refreshers?.size, 1);
		const refreshers: [RevisionTag | undefined, ChangesetLocalId, TreeChunk][] =
			enriched.changes[0].innerChange.refreshers
				.toArray()
				.map(([[revision, id], value]) => [revision, id, value]);

		assert.equal(refreshers[0][0], tag);
		assert.equal(refreshers[0][1], 0);
		const refreshedTree = mapCursorField(refreshers[0][2].cursor(), cursorToJsonObject);
		assert.deepEqual(refreshedTree, [content]);
	});

	it("can be disposed right after creation", () => {
		const { enricher } = setupEnricher();
		enricher[disposeSymbol]();
	});

	it("can be disposed after mutation", () => {
		const { enricher } = setupEnricher();
		enricher.applyTipChange(removeRoot, revision1);
		enricher[disposeSymbol]();
	});
});

function tagChangeInLine(
	change: ModularChangeset,
	revision: RevisionTag,
): TaggedChange<ModularChangeset> {
	return tagChange(
		modularFamily.changeRevision(
			change,
			new DefaultRevisionReplacer(revision, modularFamily.getRevisions(change)),
		),
		revision,
	);
}
