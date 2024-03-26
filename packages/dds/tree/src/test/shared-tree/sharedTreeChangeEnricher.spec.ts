/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	DetachedFieldIndex,
	ForestRootId,
	initializeForest,
	mapCursorField,
	rootFieldKey,
} from "../../core/index.js";
import { cursorToJsonObject, singleJsonCursor } from "../../domains/index.js";
import { typeboxValidator } from "../../external-utilities/index.js";
// eslint-disable-next-line import/no-internal-modules
import { optional } from "../../feature-libraries/default-schema/defaultFieldKinds.js";
import {
	DefaultEditBuilder,
	ModularChangeFamily,
	ModularChangeset,
	ModularEditBuilder,
	buildForest,
	fieldKinds,
} from "../../feature-libraries/index.js";
import { ICodecOptions, JsonCompatible } from "../../index.js";
// eslint-disable-next-line import/no-internal-modules
import { SharedTreeChangeEnricher } from "../../shared-tree/sharedTreeChangeEnricher.js";
// eslint-disable-next-line import/no-internal-modules
import { SharedTreeChange } from "../../shared-tree/sharedTreeChangeTypes.js";
import {
	IdAllocator,
	brand,
	disposeSymbol,
	idAllocatorFromMaxId,
	nestedMapToFlatList,
} from "../../util/index.js";
import { ajvValidator } from "../codec/index.js";
// eslint-disable-next-line import/no-internal-modules
import { Change } from "../feature-libraries/optional-field/optionalFieldUtils.js";
import { jsonTreeFromForest, testIdCompressor, testRevisionTagCodec } from "../utils.js";

const content: JsonCompatible = { x: 42 };

const codecOptions: ICodecOptions = { jsonValidator: ajvValidator };
const fieldBatchCodec = {
	encode: () => assert.fail("Unexpected encode"),
	decode: () => assert.fail("Unexpected decode"),
};

const modularFamily = new ModularChangeFamily(
	fieldKinds,
	testRevisionTagCodec,
	fieldBatchCodec,
	codecOptions,
);

const dataChanges: ModularChangeset[] = [];
const defaultEditor = new DefaultEditBuilder(modularFamily, (change) => dataChanges.push(change));
const modularBuilder = new ModularEditBuilder(modularFamily, () => {});

// Side effects results in `dataChanges` being populated
defaultEditor.optionalField({ parent: undefined, field: rootFieldKey }).set(undefined, false);

const removeRoot: SharedTreeChange = {
	changes: [{ type: "data", innerChange: dataChanges.at(0) ?? assert.fail("Expected change") }],
};

const revision1 = testIdCompressor.generateCompressedId();
const revision2 = testIdCompressor.generateCompressedId();

function setupEnricher() {
	const removedRoots = new DetachedFieldIndex(
		"test",
		idAllocatorFromMaxId() as IdAllocator<ForestRootId>,
		testRevisionTagCodec,
		{ jsonValidator: typeboxValidator },
	);
	const forest = buildForest();
	initializeForest(forest, [singleJsonCursor(content)], testRevisionTagCodec);
	const enricher = new SharedTreeChangeEnricher(forest, removedRoots);
	return { enricher, forest, removedRoots };
}

describe("SharedTreeChangeEnricher", () => {
	it("applies tip changes", () => {
		const { enricher, forest, removedRoots } = setupEnricher();
		assert.deepEqual(jsonTreeFromForest(forest), [content]);
		assert.deepEqual(Array.from(removedRoots.entries()), []);

		enricher.applyTipChange(removeRoot, revision1);

		assert.deepEqual(jsonTreeFromForest(forest), []);
		assert.deepEqual(Array.from(removedRoots.entries()), [
			{ id: { major: revision1, minor: 0 }, root: 0 },
		]);
	});

	it("updates enrichments", () => {
		const { enricher } = setupEnricher();
		enricher.applyTipChange(removeRoot, revision1);

		const restore = Change.atOnce(
			Change.reserve("self", brand(0)),
			Change.move({ revision: revision1, localId: brand(0) }, "self"),
		);
		const restoreRoot: SharedTreeChange = {
			changes: [
				{
					type: "data",
					innerChange: modularBuilder.buildChange(
						{ parent: undefined, field: rootFieldKey },
						optional.identifier,
						brand(restore),
					),
				},
			],
		};

		const enriched = enricher.updateChangeEnrichments(restoreRoot, revision2);

		// Check that the original change was not modified
		assert.equal(restoreRoot.changes[0].type, "data");
		assert.equal(restoreRoot.changes[0].innerChange.refreshers, undefined);

		// Check that the enriched change now sports the adequate refresher
		assert.equal(enriched.changes[0].type, "data");
		assert.equal(enriched.changes[0].innerChange.refreshers?.size, 1);
		const refreshers = nestedMapToFlatList(enriched.changes[0].innerChange.refreshers);
		assert.equal(refreshers[0][0], revision1);
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
