/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { currentVersion } from "../../../codec/index.js";
import {
	makeAnonChange,
	type ChangeEncodingContext,
	type TaggedChange,
} from "../../../core/index.js";
import {
	fieldBatchCodecBuilder,
	ModularChangeFormatVersion,
} from "../../../feature-libraries/index.js";
import {
	ForestTypeOptimized,
	type SharedTreeChange,
	type TreeCheckout,
} from "../../../shared-tree/index.js";
import {
	SharedTreeChangeFamily,
	// eslint-disable-next-line import-x/no-internal-modules -- Exercise the production change family directly.
} from "../../../shared-tree/sharedTreeChangeFamily.js";
import { ajvValidator } from "../../codec/index.js";
import {
	defaultRevisionMetadataFromChanges,
	mintRevisionTag,
	testIdCompressor,
	testRevisionTagCodec,
} from "../../utils.js";

import { generateSharedTreeHistories, type SharedTreeHistory } from "./historyGeneration.js";
import { createMultiFieldFixture, operationGenerator } from "./multiFieldFixture.js";
import {
	SharedTreeAxiomAdapter,
	assertSharedTreeChangeHasNoEffects,
	assertTaggedSharedTreeChangesEqual,
	assertSharedTreeReplayEqual,
	verifySharedTreeRebaseOverComposition,
	assertSharedTreeChangesEqual,
} from "./sharedTreeAxioms.js";
import type { SessionId } from "@fluidframework/id-compressor";

function createFamily(): SharedTreeChangeFamily {
	const options = { jsonValidator: ajvValidator, minVersionForCollab: currentVersion };
	return new SharedTreeChangeFamily(
		testRevisionTagCodec,
		fieldBatchCodecBuilder.build(options),
		options,
		undefined,
		testIdCompressor,
	);
}

function changes(history: SharedTreeHistory): TaggedChange<SharedTreeChange>[] {
	return history.map((entry) => entry.change);
}

function withTrace(histories: readonly SharedTreeHistory[], run: () => void): void {
	try {
		run();
	} catch (error) {
		throw new Error(
			`SharedTree axiom failed for ${JSON.stringify(histories.map((history) => history.map((entry) => entry.description)))}`,
			{ cause: error },
		);
	}
}

describe("SharedTree axioms: bounded multi-field histories", () => {
	let parent: TreeCheckout;
	let adapter: SharedTreeAxiomAdapter;
	beforeEach(() => {
		parent = createMultiFieldFixture(ForestTypeOptimized);
		adapter = new SharedTreeAxiomAdapter(createFamily(), mintRevisionTag);
	});
	afterEach(() => {
		parent.dispose();
	});

	function historiesOfDepth(depth: number) {
		return generateSharedTreeHistories(parent, operationGenerator, depth, {
			removeMovedNode: true,
		});
	}

	it("composition and rebase identities for initial operations", () => {
		let count = 0;
		for (const history of historiesOfDepth(1)) {
			withTrace([history], () => {
				const edit = history[0].change;
				const empty = adapter.empty();
				const metadata = defaultRevisionMetadataFromChanges([empty, edit]);
				assertTaggedSharedTreeChangesEqual(adapter.rebase(edit, empty, metadata), edit);
				assertTaggedSharedTreeChangesEqual(adapter.rebase(empty, edit, metadata), empty);
				for (const composition of [
					adapter.compose([edit, empty]),
					adapter.compose([empty, edit]),
				]) {
					assertTaggedSharedTreeChangesEqual(composition, makeAnonChange(edit.change));
					assertSharedTreeReplayEqual(parent, [composition], [edit], mintRevisionTag());
				}
			});
			count++;
		}
	});

	it("composes each operation with its rollback to a change with no effects", () => {
		for (const history of historiesOfDepth(1)) {
			withTrace([history], () => {
				const edit = history[0].change;
				const rollback = adapter.invert(edit, true);
				assert.equal(rollback.rollbackOf, edit.revision);
				assert.equal(typeof rollback.revision, "number");
				const composed = adapter.compose([edit, rollback]);
				assertSharedTreeChangeHasNoEffects(composed);
				assertSharedTreeReplayEqual(parent, [composed], [], mintRevisionTag());
			});
		}
	});

	it("composition matches sequential replay for all two-edit histories", () => {
		let count = 0;
		for (const history of historiesOfDepth(2)) {
			withTrace([history], () => {
				const edits = changes(history);
				assertSharedTreeReplayEqual(
					parent,
					[adapter.compose(edits)],
					edits,
					mintRevisionTag(),
				);
			});
			count++;
		}
	});

	it("composition is associative for all three-edit histories", () => {
		let count = 0;
		for (const history of historiesOfDepth(3)) {
			withTrace([history], () => {
				const [a, b, c] = changes(history);
				const left = adapter.compose([adapter.compose([a, b]), c]);
				const right = adapter.compose([a, adapter.compose([b, c])]);
				assertTaggedSharedTreeChangesEqual(left, right);
			});
			count++;
		}
	});

	it("roundtrips depth-1 changes through codec", () => {
		const formats = [...adapter.family.codecs.getSupportedFormats()].filter(
			(format) => format !== ModularChangeFormatVersion.vDetachedRoots,
		);
		const codecs = formats.map((format) => adapter.family.codecs.resolve(format));
		const sessionId = "session1" as SessionId;
		let count = 0;
		for (const local of historiesOfDepth(1)) {
			const [{ change, revision }] = changes(local);
			for (const codec of codecs) {
				const context: ChangeEncodingContext = {
					originatorId: sessionId,
					isSummary: false,
					revision,
					idCompressor: testIdCompressor,
				};
				const encoded = codec.encode(change, context);
				const decoded = codec.decode(encoded, context);
				assertSharedTreeChangesEqual(decoded, change);
			}
			count++;
		}
	});

	it("roundtrips rebased depth-1 changes through codec", () => {
		const formats = [...adapter.family.codecs.getSupportedFormats()].filter(
			(format) => format !== ModularChangeFormatVersion.vDetachedRoots,
		);
		const codecs = formats.map((format) => adapter.family.codecs.resolve(format));
		const sessionId = "session1" as SessionId;
		const bases = [...historiesOfDepth(1)];
		let count = 0;
		for (const [local] of historiesOfDepth(1)) {
			for (const [base] of bases) {
				const metadata = defaultRevisionMetadataFromChanges([base.change, local.change]);
				const rebased = adapter.rebase(local.change, base.change, metadata);
				for (const codec of codecs) {
					const context: ChangeEncodingContext = {
						originatorId: sessionId,
						isSummary: false,
						revision: local.change.revision,
						idCompressor: testIdCompressor,
					};
					const encoded = codec.encode(rebased.change, context);
					const decoded = codec.decode(encoded, context);
					assertSharedTreeChangesEqual(decoded, rebased.change);
				}
				count++;
			}
		}
	});

	it.skip("rebases initial operations over all two-edit histories", () => {
		const locals = [...historiesOfDepth(1)];
		const bases = [...historiesOfDepth(2)];
		let count = 0;
		for (const local of locals) {
			for (const base of bases) {
				withTrace([local, base], () => {
					const edits = changes(base);
					const rebased = verifySharedTreeRebaseOverComposition(
						adapter,
						local[0].change,
						edits,
					);
					assertSharedTreeReplayEqual(
						parent,
						[adapter.compose(edits), rebased],
						[...edits, rebased],
						mintRevisionTag(),
					);
				});
				count++;
			}
		}
	});
});
