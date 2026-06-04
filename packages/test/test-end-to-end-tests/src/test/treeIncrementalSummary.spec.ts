/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, type CompatApis } from "@fluid-private/test-version-utils";
import { LoaderHeader, type IContainer } from "@fluidframework/container-definitions/internal";
import type { ISummarizer } from "@fluidframework/container-runtime/internal";
import {
	DataObjectFactoryType,
	ITestObjectProvider,
	createSummarizer,
	getContainerEntryPointBackCompat,
	summarizeNow,
	type ITestContainerConfig,
	type ITestFluidObject,
	type SummaryInfo,
} from "@fluidframework/test-utils/internal";
import {
	FluidClientVersion,
	TreeCompressionStrategy,
	type ITree,
} from "@fluidframework/tree/alpha";
import * as semver from "semver";

/**
 * End-to-end tests for SharedTree incremental summarization.
 *
 * Incremental summarization splits the forest into independently-encoded chunks (opted in via
 * `incrementalSummaryHint`). When a chunk's content is unchanged across summaries it is written as
 * a summary handle pointing at that chunk's blob in the previous summary, instead of being
 * re-encoded into the new summary.
 *
 * Stale-handle-path bug (fixed by {@link https://github.com/microsoft/FluidFramework/pull/26990 | PR #26990}):
 * When a parent chunk was re-encoded with a new `referenceId`, child chunks that became handles
 * still held a `summaryPath` string referencing the parent's *old* `referenceId`. On the next
 * summary, those handle URLs pointed at keys that no longer existed in the preceding summary tree,
 * so the summary (or a subsequent load) threw.
 * Many of the change sequences below exist specifically to exercise that bug; it is also why incremental
 * summarization requires tree version 2.100.0+ in compat runs (see the version gate in the smoke test below).
 *
 * @remarks
 * The change sequences and the `makeChangeAtDepth` helper here mirror the unit tests in
 * `packages/dds/tree/src/test/feature-libraries/forest-summary/forestSummarizer.spec.ts`.
 * Changes to the scenarios in one module should be mirrored in the other.
 */

/**
 * A 4-depth nested schema where each level's map field carries `incrementalSummaryHint`,
 * creating 4 independent incremental chunks:
 * - Depth 1: the `documents` map (outermost chunk).
 * - Depth 2: each document's `sections` map.
 * - Depth 3: each section's `items` map.
 * - Depth 4: each item's `tags` map (innermost chunk).
 *
 * The root field `version` (depth 0) is non-incremental and does not belong to any chunk.
 *
 * @param dataRuntimeApi - The (possibly back-compat) data-runtime APIs used to build the schema
 * and configure the tree. All tree types are sourced from here so the schema and the
 * incremental-encoding policy come from the same package version.
 * @param provider - The test object provider used to create or load the container.
 * @param createOrLoad - `"create"` makes a new container and initializes the tree; `"load"` loads
 * an existing container from the summary identified by `summaryVersion`.
 * @param variant - `"single"` initializes one document/section/item/tag; `"double"` adds a
 * second sibling section (`Sec2`) so that sibling chunks become handles alongside descendant
 * handles in the same summary. Only relevant when `createOrLoad` is `"create"`.
 * @param summaryVersion - The summary version to load from. Only relevant when `createOrLoad`
 * is `"load"`.
 * @returns The `container`, the strongly-typed `view` over the `Workspace` schema, and the
 * `testContainerConfig` used (so callers can spin up a matching summarizer).
 *
 * @privateRemarks
 * An explicit return type is intentionally omitted: the returned `view`'s type references the
 * `Workspace`/`Document`/`Section`/... node schema classes, which are defined locally inside this
 * function and therefore cannot be named at module scope. {@link WorkspaceView} recovers the type
 * via `ReturnType` for the helpers that consume the view.
 */

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function make4DepthTreeView(
	dataRuntimeApi: CompatApis["dataRuntime"],
	provider: ITestObjectProvider,
	createOrLoad: "create" | "load",
	variant: "single" | "double" = "single",
	summaryVersion?: string,
) {
	const {
		SchemaFactoryAlpha,
		TreeViewConfigurationAlpha,
		incrementalSummaryHint,
		configuredSharedTree,
		incrementalEncodingPolicyForAllowedTypes,
		ForestTypeOptimized,
	} = dataRuntimeApi.packages.tree;

	const sf = new SchemaFactoryAlpha("incrementalSummary4DepthE2E");

	/** Depth 4 (innermost): a single tag entry, contained within the `tags` incremental chunk. */
	class Tag extends sf.object("Tag", {
		name: sf.string,
		value: sf.string,
	}) {}

	/** Depth 3: an item whose `tags` map is the depth-4 incremental chunk. */
	class Item extends sf.object("Item", {
		itemName: sf.string,
		tags: sf.types([{ type: sf.map(Tag), metadata: {} }], {
			custom: { [incrementalSummaryHint]: true },
		}),
	}) {}

	/** Depth 2: a section whose `items` map is the depth-3 incremental chunk. */
	class Section extends sf.object("Section", {
		sectionName: sf.string,
		items: sf.types([{ type: sf.map(Item), metadata: {} }], {
			custom: { [incrementalSummaryHint]: true },
		}),
	}) {}

	/** Depth 1: a document whose `sections` map is the depth-2 incremental chunk. */
	class Document extends sf.object("Document", {
		docName: sf.string,
		sections: sf.types([{ type: sf.map(Section), metadata: {} }], {
			custom: { [incrementalSummaryHint]: true },
		}),
	}) {}

	/** Depth 0 (root): workspace whose `documents` map is the depth-1 incremental chunk. */
	class Workspace extends sf.object("Workspace", {
		version: sf.string,
		documents: sf.types([{ type: sf.map(Document), metadata: {} }], {
			custom: { [incrementalSummaryHint]: true },
		}),
	}) {}

	const viewConfig = new TreeViewConfigurationAlpha({ schema: Workspace });

	const SharedTree = configuredSharedTree({
		forest: ForestTypeOptimized,
		treeEncodeType: TreeCompressionStrategy.CompressedIncremental,
		// Incremental summarization only takes effect when the tree writes the incremental-capable
		// forest summary format (ForestSummaryFormatVersion.v3), which is selected when
		// minVersionForCollab is at least 2.74.
		minVersionForCollab: FluidClientVersion.v2_74,
		shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(viewConfig),
	});

	const treeId = "sharedTree";
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		runtimeOptions: {
			enableRuntimeIdCompressor: "on",
			// Disable the runtime's automatic summarizer so the test controls exactly when summaries
			// happen (via `summarizeNow` on a dedicated summarizer). This keeps each incremental
			// summary deterministic and prevents background summaries from racing the assertions.
			summaryOptions: {
				summaryConfigOverrides: { state: "disabled" },
			},
		},
		registry: [[treeId, SharedTree.getFactory()]],
	};

	const container = await (createOrLoad === "create"
		? provider.makeTestContainer(testContainerConfig)
		: provider.loadTestContainer(testContainerConfig, {
				[LoaderHeader.version]: summaryVersion,
			}));

	const dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
	const tree = await dataObject.getSharedObject<ITree>(treeId);
	const view = tree.viewWith(viewConfig);

	if (createOrLoad === "create") {
		const sections: Record<string, Section> = {
			Sec1: new Section({
				sectionName: "Section 1",
				items: {
					Item1: new Item({
						itemName: "Item 1",
						tags: { Tag1: new Tag({ name: "tag1", value: "value1" }) },
					}),
				},
			}),
		};
		if (variant === "double") {
			sections.Sec2 = new Section({
				sectionName: "Section 2",
				items: {
					Item1: new Item({
						itemName: "Item 2",
						tags: { Tag1: new Tag({ name: "tag2", value: "value2" }) },
					}),
				},
			});
		}
		view.initialize(
			new Workspace({
				version: "v1",
				documents: {
					Doc1: new Document({ docName: "Document 1", sections }),
				},
			}),
		);
	}

	return { container, view, testContainerConfig };
}

/**
 * The strongly-typed `TreeView` (over the 4-depth `Workspace` schema) produced by
 * {@link make4DepthTreeView}. Derived from its return type because the schema classes are
 * defined locally inside that function.
 */
type WorkspaceView = Awaited<ReturnType<typeof make4DepthTreeView>>["view"];

/**
 * Mutates the tree at the given depth to trigger re-summarization of that depth and all its
 * ancestors. Mirrors `makeChangeAtDepth` from the unit tests:
 * - Depth 0 changes `version` (non-incremental root field) — the depth-1 chunk becomes a handle.
 * - Depth 1 changes `Doc1.docName`.
 * - Depth 2 changes `Sec1.sectionName` (also re-encodes depth 1).
 * - Depth 3 changes `Item1.itemName` (also re-encodes depths 1–2).
 * - Depth 4 changes a tag `name` (re-encodes all depths; no handles).
 */
function makeChangeAtDepth(
	view: WorkspaceView,
	depth: 0 | 1 | 2 | 3 | 4,
	iteration: number,
): void {
	const root = view.root;
	const newVal = `updated-${iteration}`;
	if (depth === 0) {
		root.version = newVal;
		return;
	}
	const doc = root.documents.get("Doc1");
	assert(doc !== undefined, "Doc1 not found");
	if (depth === 1) {
		doc.docName = newVal;
		return;
	}
	const sec = doc.sections.get("Sec1");
	assert(sec !== undefined, "Sec1 not found");
	if (depth === 2) {
		sec.sectionName = newVal;
		return;
	}
	const item = sec.items.get("Item1");
	assert(item !== undefined, "Item1 not found");
	if (depth === 3) {
		item.itemName = newVal;
		return;
	}
	const tag = item.tags.get("Tag1");
	assert(tag !== undefined, "Tag1 not found");
	tag.name = newVal;
}

/** Reads the mutable fields along the `Doc1/Sec1/Item1/Tag1` path for round-trip comparison. */
function readState(view: WorkspaceView): {
	version: string;
	docName: string;
	sectionName: string;
	itemName: string;
	tagName: string;
} {
	const root = view.root;
	const doc = root.documents.get("Doc1");
	assert(doc !== undefined, "Doc1 not found");
	const sec = doc.sections.get("Sec1");
	assert(sec !== undefined, "Sec1 not found");
	const item = sec.items.get("Item1");
	assert(item !== undefined, "Item1 not found");
	const tag = item.tags.get("Tag1");
	assert(tag !== undefined, "Tag1 not found");
	return {
		version: root.version,
		docName: doc.docName,
		sectionName: sec.sectionName,
		itemName: item.itemName,
		tagName: tag.name,
	};
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function createContainerAndGetTreeView(
	provider: ITestObjectProvider,
	apis: CompatApis,
	variant: "single" | "double" = "single",
) {
	return make4DepthTreeView(apis.dataRuntime, provider, "create", variant);
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function loadContainerAndGetTreeView(
	provider: ITestObjectProvider,
	apis: CompatApis,
	summaryVersion?: string,
) {
	return make4DepthTreeView(
		apis.dataRuntimeForLoading,
		provider,
		"load",
		undefined,
		summaryVersion,
	);
}

async function createTestSummarizer(
	provider: ITestObjectProvider,
	container: IContainer,
	testContainerConfig: ITestContainerConfig,
	summaryVersion?: string,
): Promise<ISummarizer> {
	const summarizerContainerConfig: ITestContainerConfig = {
		...testContainerConfig,
		// Clear the `state: "disabled"` summary override applied to the main container above so the
		// dedicated summarizer runs with default summary behavior and can summarize on demand.
		runtimeOptions: { ...testContainerConfig.runtimeOptions, summaryOptions: undefined },
	};
	const { summarizer } = await createSummarizer(
		provider,
		container,
		summarizerContainerConfig,
		summaryVersion,
	);
	return summarizer;
}

describeCompat(
	"SharedTree incremental summary smoke tests",
	"FullCompat",
	(getTestObjectProvider, apis) => {
		let provider: ITestObjectProvider;

		beforeEach("getTestObjectProvider", async function () {
			provider = getTestObjectProvider({ syncSummarizer: true });
			// The Compat APIs didn't have the tree package available in all versions. Skip the test
			// in version combination where it's not available.
			if (
				apis.dataRuntime.packages.tree === undefined ||
				apis.dataRuntimeForLoading.packages.tree === undefined
			) {
				this.skip();
			}
			// Stale-handle-path bug (fixed by {@link https://github.com/microsoft/FluidFramework/pull/26990 | PR #26990})
			// was released in version 2.100.0. Any version before that will have the bug, so skip running it.
			// AB#74859 is tracking the removal of this workaround.
			if (
				semver.lt(apis.dataRuntime.version, "2.100.0") ||
				semver.lt(apis.dataRuntimeForLoading.version, "2.100.0")
			) {
				this.skip();
			}
		});

		// This smoke test runs against all services to confirm the incremental summary feature works
		// end-to-end on real services.
		it("new container and summarizer can load from incremental summary", async () => {
			const { container, view, testContainerConfig } = await createContainerAndGetTreeView(
				provider,
				apis,
			);
			const summarizer = await createTestSummarizer(provider, container, testContainerConfig);

			// First summary encodes every chunk as a full tree (no handles yet).
			await provider.ensureSynchronized();
			await summarizeNow(summarizer);

			makeChangeAtDepth(view, 1, 0);
			await provider.ensureSynchronized();
			const { summaryVersion } = await summarizeNow(summarizer);

			// A fresh container loaded from that summary must reflect the change.
			const { view: loadedView } = await loadContainerAndGetTreeView(
				provider,
				apis,
				summaryVersion,
			);
			assert.deepStrictEqual(
				readState(loadedView),
				readState(view),
				"Loaded document should match the summarized document",
			);

			summarizer.close();
			const newSummarizer = await createTestSummarizer(
				provider,
				container,
				testContainerConfig,
				summaryVersion,
			);
			await assert.doesNotReject(
				summarizeNow(newSummarizer),
				"New summarizer should be able to summarize the document",
			);
		});
	},
);

describeCompat(
	"Shared tree incremental summary 4-depth schema",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		let provider: ITestObjectProvider;

		beforeEach("getTestObjectProvider", async function () {
			provider = getTestObjectProvider({ syncSummarizer: true });

			// These tests only run on local service.
			// They are exhaustive tests of the incremental summary feature. Running on all
			// services is expensive and takes a long time.
			if (provider.driver.type !== "local") {
				this.skip();
			}
		});

		/**
		 * Ordered sequences of depth changes, mirroring the parameterized unit test cases. Each change
		 * drives a new summary round; together they exercise different combinations of chunk re-encoding
		 * and handle reuse, including the stale-handle-path and copy-propagation scenarios.
		 */
		const fourDepthChangeSequences: {
			name: string;
			changeDepths: readonly (0 | 1 | 2 | 3 | 4)[];
		}[] = [
			{ name: "ascending depths 0→1→2→3→4", changeDepths: [0, 1, 2, 3, 4] },
			{ name: "descending depths 4→3→2→1", changeDepths: [4, 3, 2, 1] },
			{ name: "shallow then deep: depth 1 then 3", changeDepths: [1, 3] },
			{ name: "deep then shallow: depth 3 then 1", changeDepths: [3, 1] },
			{ name: "non-sequential: depth 2 then 4 then 1", changeDepths: [2, 4, 1] },
			// The following exercise the stale-handle-path bug: when a parent chunk is re-encoded in
			// summary S(i), child handles inside it reference a summaryPath recorded when the child was
			// last encoded as a full tree. In S(i+1) those handles are nested inside the newly-re-encoded
			// parent, so their path must resolve in (i), not in an older summary.
			{ name: "same shallow depth twice: depth 1 then 1", changeDepths: [1, 1] },
			{ name: "same depth twice: depth 2 then 2", changeDepths: [2, 2] },
			{ name: "same depth three times: depth 1 then 1 then 1", changeDepths: [1, 1, 1] },
			{
				name: "shallow then same shallow twice: depth 2 then 1 then 1",
				changeDepths: [2, 1, 1],
			},
			{
				name: "deep then same shallow twice: depth 3 then 1 then 1",
				changeDepths: [3, 1, 1],
			},
			{
				name: "repeated shallow with deep interleaved: depth 1 then 2 then 1",
				changeDepths: [1, 2, 1],
			},
			// The next test exercises the completeSummary copy-propagation path: a depth-0 change turns all
			// incremental chunks into handles whose tracking entries (including stale summaryPaths) are
			// copied forward; the following deeper change gives the parent a new referenceId so a
			// copied-forward child handle would point at a key that no longer exists in the preceding summary.
			{
				name: "stale path via copy propagation: depth 2, depth 0, depth 2",
				changeDepths: [2, 0, 2],
			},
		];

		for (const { name, changeDepths } of fourDepthChangeSequences) {
			it(`summarizes across rounds and loads correctly with ${name}`, async () => {
				const { container, view, testContainerConfig } = await createContainerAndGetTreeView(
					provider,
					apis,
				);
				const summarizer = await createTestSummarizer(
					provider,
					container,
					testContainerConfig,
				);

				// Initial summary (no changes yet → no handles).
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				const validateContainerLoad = async (summaryVersion: string): Promise<void> => {
					const { view: loadedView } = await loadContainerAndGetTreeView(
						provider,
						apis,
						summaryVersion,
					);
					assert.deepStrictEqual(
						readState(loadedView),
						readState(view),
						"Loaded document should reflect the latest mutation",
					);
				};

				// Each round mutates at the specified depth and takes an incremental summary. Every
				// summary must succeed — before the stale-handle-path fix (PR #26990; see the module
				// header), re-encoding a parent chunk left child handles pointing at a stale
				// summaryPath and the summary threw.
				for (let round = 0; round < changeDepths.length; round++) {
					const changeDepth = changeDepths[round];
					makeChangeAtDepth(view, changeDepth, round);
					await provider.ensureSynchronized();

					let summaryInfo: SummaryInfo | undefined;
					await assert.doesNotReject(
						summarizeNow(summarizer).then((info) => {
							summaryInfo = info;
						}),
						`Summary for round ${round} (depth ${changeDepth}) should succeed`,
					);
					assert(summaryInfo !== undefined, `Round ${round} should produce a summary`);
					await assert.doesNotReject(
						validateContainerLoad(summaryInfo.summaryVersion),
						`Loading of summary version ${summaryInfo.summaryVersion} should succeed`,
					);
				}
			});
		}

		it("a depth-3 change produces sibling and descendant handles in the same summary", async () => {
			// Doc1 has two sections (Sec1 and Sec2). Changing Item1.itemName in Sec1 (a depth-3
			// change) re-encodes the documents, Doc1.sections, and Sec1.items chunks, while Sec2.items
			// (a sibling at depth 3) and Item1.tags (a descendant at depth 4) become handles in the
			// same summary. Repeating the change exercises the stale-handle-path bug (see the module
			// header / PR #26990) for both handles.
			const { container, view, testContainerConfig } = await createContainerAndGetTreeView(
				provider,
				apis,
				"double",
			);
			const summarizer = await createTestSummarizer(provider, container, testContainerConfig);

			// Initial summary (no changes yet → no handles).
			await provider.ensureSynchronized();
			await summarizeNow(summarizer);

			const validateContainerLoad = async (summaryVersion: string): Promise<void> => {
				const { view: loadedView } = await loadContainerAndGetTreeView(
					provider,
					apis,
					summaryVersion,
				);
				assert.deepStrictEqual(
					readState(loadedView),
					readState(view),
					"Loaded document should reflect the latest mutation",
				);
			};

			for (let round = 0; round < 3; round++) {
				makeChangeAtDepth(view, 3, round);
				await provider.ensureSynchronized();

				let summaryInfo: SummaryInfo | undefined;
				await assert.doesNotReject(
					summarizeNow(summarizer).then((info) => {
						summaryInfo = info;
					}),
					`Summary for round ${round} should succeed`,
				);
				assert(summaryInfo !== undefined, `Round ${round} should produce a summary`);
				await assert.doesNotReject(
					validateContainerLoad(summaryInfo.summaryVersion),
					`Loading of summary version ${summaryInfo.summaryVersion} should succeed`,
				);
			}
		});
	},
);
