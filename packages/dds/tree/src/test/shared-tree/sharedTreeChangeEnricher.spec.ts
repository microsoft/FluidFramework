/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	type ChangesetLocalId,
	DetachedFieldIndex,
	type ForestRootId,
	type IEditableForest,
	type RevisionTag,
	type TaggedChange,
	TreeStoredSchemaRepository,
	mapCursorField,
	rootFieldKey,
	tagChange,
} from "../../core/index.js";
import { cursorToJsonObject, fieldJsonCursor } from "../json/index.js";
import { typeboxValidator } from "../../external-utilities/index.js";
// eslint-disable-next-line import/no-internal-modules
import { optional } from "../../feature-libraries/default-schema/defaultFieldKinds.js";
import {
	DefaultEditBuilder,
	ModularChangeFamily,
	type ModularChangeset,
	ModularEditBuilder,
	type TreeChunk,
	buildForest,
	fieldKinds,
	initializeForest,
} from "../../feature-libraries/index.js";
import {
	type SharedTreeMutableChangeEnricher,
	SharedTreeReadonlyChangeEnricher,
	// eslint-disable-next-line import/no-internal-modules
} from "../../shared-tree/sharedTreeChangeEnricher.js";
// eslint-disable-next-line import/no-internal-modules
import type { SharedTreeChange } from "../../shared-tree/sharedTreeChangeTypes.js";
import {
	type IdAllocator,
	type JsonCompatible,
	brand,
	disposeSymbol,
	idAllocatorFromMaxId,
} from "../../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import { Change } from "../feature-libraries/optional-field/optionalFieldUtils.js";
import {
	failCodecFamily,
	jsonTreeFromForest,
	mintRevisionTag,
	testIdCompressor,
	testRevisionTagCodec,
} from "../utils.js";

const content: JsonCompatible = { x: 42 };

const modularFamily = new ModularChangeFamily(fieldKinds, failCodecFamily);

const dataChanges: ModularChangeset[] = [];
const defaultEditor = new DefaultEditBuilder(modularFamily, mintRevisionTag, (taggedChange) =>
	dataChanges.push(taggedChange.change),
);
const modularBuilder = new ModularEditBuilder(
	modularFamily,
	modularFamily.fieldKinds,
	() => {},
);

// Side effects results in `dataChanges` being populated
defaultEditor.optionalField({ parent: undefined, field: rootFieldKey }).set(undefined, false);

const removeRoot: SharedTreeChange = {
	changes: [
		{ type: "data", innerChange: dataChanges.at(0) ?? assert.fail("Expected change") },
	],
};

const revision1 = testIdCompressor.generateCompressedId();

interface TestChangeEnricher {
	forest: IEditableForest;
	removedRoots: DetachedFieldIndex;
	fork(): SharedTreeMutableChangeEnricher & TestChangeEnricher;
}

export function setupEnricher() {
	const removedRoots = new DetachedFieldIndex(
		"test",
		idAllocatorFromMaxId() as IdAllocator<ForestRootId>,
		testRevisionTagCodec,
		testIdCompressor,
		{ jsonValidator: typeboxValidator },
	);
	const forest = buildForest();
	initializeForest(forest, fieldJsonCursor([content]), testRevisionTagCodec, testIdCompressor);
	const schema = new TreeStoredSchemaRepository();
	const enricher = new SharedTreeReadonlyChangeEnricher(
		forest,
		schema,
		removedRoots,
	) as SharedTreeReadonlyChangeEnricher & TestChangeEnricher;
	const fork = enricher.fork() as SharedTreeMutableChangeEnricher & TestChangeEnricher;
	return { enricher, fork };
}

describe("SharedTreeChangeEnricher", () => {
	it("applies tip changes to fork", () => {
		const { enricher, fork } = setupEnricher();
		assert.deepEqual(jsonTreeFromForest(enricher.forest), [content]);
		assert.deepEqual(Array.from(enricher.removedRoots.entries()), []);

		fork.applyTipChange(removeRoot, revision1);

		assert.deepEqual(jsonTreeFromForest(fork.forest), []);
		assert.equal(Array.from(fork.removedRoots.entries()).length, 1);

		// The original enricher should not have been modified
		assert.deepEqual(jsonTreeFromForest(enricher.forest), [content]);
		assert.deepEqual(Array.from(enricher.removedRoots.entries()), []);
	});

	it("updates enrichments", () => {
		const { fork } = setupEnricher();
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
		fork.applyTipChange(removeRoot2, tag);

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

		const enriched = fork.updateChangeEnrichments(restoreRoot);

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
		const { fork } = setupEnricher();
		fork[disposeSymbol]();
	});

	it("can be disposed after mutation", () => {
		const { fork } = setupEnricher();
		fork.applyTipChange(removeRoot, revision1);
		fork[disposeSymbol]();
	});
});

function tagChangeInLine(
	change: ModularChangeset,
	revision: RevisionTag,
): TaggedChange<ModularChangeset> {
	return tagChange(modularFamily.changeRevision(change, revision), revision);
}
