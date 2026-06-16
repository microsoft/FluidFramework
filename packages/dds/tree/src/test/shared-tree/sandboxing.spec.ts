/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import type {
	ISharedObjectKind,
	SharedObjectKind,
} from "@fluidframework/shared-object-base/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import { asAlpha } from "../../api.js";
import { FluidClientVersion } from "../../codec/index.js";
import { type ChangeMetadata } from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import {
	ForestTypeExpensiveDebug,
	independentInitializedView,
	TreeAlpha,
} from "../../shared-tree/index.js";
import {
	extractPersistedSchema,
	type TreeViewAlpha,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/api/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { TreeViewConfiguration } from "../../simple-tree/index.js";
import { configuredSharedTree, type ISharedTree } from "../../treeFactory.js";
// eslint-disable-next-line import-x/no-internal-modules
import {
	TestTreeProviderLite,
	StringArray,
	getView,
	createSnapshotCompressor,
} from "../utils.js";
import type { JsonCompatibleReadOnly } from "../../util/index.js";

const enableSchemaValidation = true;

const DebugSharedTree = configuredSharedTree({
	jsonValidator: FormatValidatorBasic,
	forest: ForestTypeExpensiveDebug,
}) as SharedObjectKind<ISharedTree> & ISharedObjectKind<ISharedTree>;

class MockSharedTreeRuntime extends MockFluidDataStoreRuntime {
	public constructor() {
		super({
			idCompressor: createIdCompressor(),
			registry: [DebugSharedTree.getFactory()],
		});
	}
}

/**
 * Simple non-factory based wrapper around `new SharedTree` with test appropriate defaults.
 *
 * See TestTreeProvider, TestTreeProviderLite and TreeFactory for other ways to build trees.
 *
 * If what is needed is a view, see {@link getView}.
 */
function treeTestFactory(): ISharedTree {
	return DebugSharedTree.getFactory().create(
		new MockFluidDataStoreRuntime({
			idCompressor: createSnapshotCompressor(),
			clientId: "test-client",
			id: "test",
		}),
		"test",
	);
}

it("Host and Sandbox Demo", () => {
	const provider = new TestTreeProviderLite(
		2,
		configuredSharedTree({
			jsonValidator: FormatValidatorBasic,
			minVersionForCollab: FluidClientVersion.v2_80,
		}).getFactory(),
	);
	const config = new TreeViewConfiguration({
		schema: StringArray,
		enableSchemaValidation,
	});

	const peer = asAlpha(provider.trees[0].viewWith(config));
	peer.initialize(["A"]);
	provider.synchronizeMessages();

	interface HostState {
		/** The main branch on the host. Is automatically updated when peer changes are received. */
		readonly main: TreeViewAlpha<typeof StringArray>;
		/** The local branch on the host. Always reflects the state of the sandbox (though lags behind it due to async) */
		readonly local: TreeViewAlpha<typeof StringArray>;
		readonly processOutboundChange: (change: JsonCompatibleReadOnly) => void;
	}

	class Sandbox {
		/** The independent view on the sandbox. */
		readonly view: TreeViewAlpha<typeof StringArray>;
		/** The number of local changes that have been made in the sandbox but not yet reflected on the host. */
		inFlight: number;
		private sendOutboundChange(change: JsonCompatibleReadOnly): Promise<void>;
	}

	const main = asAlpha(provider.trees[1].viewWith(config));
	const host: HostState = { main, local: main.fork(), processOutboundChange: (change) => {} };

	// TODO: this is a legacy API: we need a stable alternative.
	const idCompressor = createIdCompressor();
	const startingState = TreeAlpha.exportCompressed(host.local.root, {
		idCompressor,
		minVersionForCollab: FluidClientVersion.v2_80,
	});

	const sandbox: SandboxState = {
		view: independentInitializedView(
			config,
			{ jsonValidator: FormatValidatorBasic },
			{
				tree: startingState,
				schema: extractPersistedSchema(config.schema, FluidClientVersion.v2_80, () => false),
				// TODO: how is the sandbox supposed to get the same compressor state as the host?
				idCompressor,
			},
		),
		inFlight: 0,
		sendOutboundChange: async (change: JsonCompatibleReadOnly): Promise<void> => {
			await Promise.resolve(); // Simulates async boundary
			host.processOutboundChange(change);
		},
	};
	assert.deepEqual([...sandbox.view.root], ["A"]);

	sandbox.view.events.on("changed", (metadata: ChangeMetadata) => {
		if (metadata.isLocal) {
			sandbox.inFlight += 1;
			const newChange = metadata.getChange();
			sendOutboundChange;
		}
	});

	// Edit in the sandbox
	sandbox.view.root.push("B(s)");
});
