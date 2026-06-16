/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";

import { asAlpha } from "../../api.js";
import { FluidClientVersion, type ICodecOptions } from "../../codec/index.js";
import type { ChangeMetadata } from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import {
	independentInitializedView,
	TreeAlpha,
	type ForestOptions,
	type ViewContent,
} from "../../shared-tree/index.js";
import {
	extractPersistedSchema,
	type TreeViewAlpha,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/api/index.js";
import { TreeViewConfiguration, type ImplicitFieldSchema } from "../../simple-tree/index.js";
import { configuredSharedTree } from "../../treeFactory.js";
import type { JsonCompatibleReadOnly } from "../../util/index.js";
import { TestTreeProviderLite, StringArray } from "../utils.js";

const enableSchemaValidation = true;

interface HostState {
	/** The main branch on the host. Is automatically updated when peer changes are received. */
	readonly main: TreeViewAlpha<typeof StringArray>;
	/** The local branch on the host. Always reflects the state of the sandbox (though lags behind it due to async) */
	readonly local: TreeViewAlpha<typeof StringArray>;
	readonly processOutboundChange: (change: JsonCompatibleReadOnly) => void;
}

class Sandbox<const TSchema extends ImplicitFieldSchema> {
	/** The independent view on the sandbox. */
	public readonly view: TreeViewAlpha<TSchema>;
	/** The number of local changes that have been made in the sandbox but not yet reflected on the host. */
	private inFlight: number = 0;

	public constructor(
		config: TreeViewConfiguration<TSchema>,
		options: ForestOptions & ICodecOptions,
		content: ViewContent,
		sendOutboundChange: (change: JsonCompatibleReadOnly) => Promise<void>,
	) {
		this.view = independentInitializedView(config, options, content);
		this.view.events.on("changed", (metadata: ChangeMetadata) => {
			if (metadata.isLocal) {
				this.inFlight += 1;
				const newChange = metadata.getChange();
				sendOutboundChange(newChange).then(
					() => (this.inFlight -= 1),
					() => {
						assert.fail("Unexpected failure");
					},
				);
			}
		});
	}
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

	const main = asAlpha(provider.trees[1].viewWith(config));
	const host: HostState = { main, local: main.fork(), processOutboundChange: (change) => {} };

	// TODO: this is a legacy API: we need a stable alternative.
	const idCompressor = createIdCompressor();
	const startingState = TreeAlpha.exportCompressed(host.local.root, {
		idCompressor,
		minVersionForCollab: FluidClientVersion.v2_80,
	});

	async function sendOutboundChangeFromSandboxToHostLocalBranch(
		change: JsonCompatibleReadOnly,
	): Promise<void> {
		await Promise.resolve(); // Simulates async boundary
		host.processOutboundChange(change);
	}

	const sandbox = new Sandbox(
		config,
		{ jsonValidator: FormatValidatorBasic },
		{
			tree: startingState,
			schema: extractPersistedSchema(config.schema, FluidClientVersion.v2_80, () => false),
			// TODO: how is the sandbox supposed to get the same compressor state as the host?
			idCompressor,
		},
		sendOutboundChangeFromSandboxToHostLocalBranch,
	);

	assert.deepEqual([...sandbox.view.root], ["A"]);

	// Edit in the sandbox
	sandbox.view.root.push("B(s)");
});
