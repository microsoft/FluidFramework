/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	deserializeIdCompressor,
	SerializationVersion,
	toIdCompressorWithCore,
} from "@fluidframework/id-compressor/internal";

import { asAlpha } from "../../../api.js";
import { FluidClientVersion } from "../../../codec/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import { independentInitializedView, TreeAlpha } from "../../../shared-tree/index.js";
import { extractPersistedSchema } from "../../../simple-tree/index.js";
import { configuredSharedTree } from "../../../treeFactory.js";
import type { JsonCompatibleReadOnly } from "../../../util/index.js";
import { TestTreeProviderLite } from "../../utils.js";

import { stringArrayConfig } from "./sandboxingTestUtils.js";
import { getCheckout } from "./synchronizationUtils.js";

/**
 * Creates a Host, peer, and compressed baseline before the Guest ID space shard exists.
 * Tests can add Host commits before creating the Guest to check initialization replay.
 */
function createCompatibilityFixture() {
	const provider = new TestTreeProviderLite(
		2,
		configuredSharedTree({
			jsonValidator: FormatValidatorBasic,
			minVersionForCollab: FluidClientVersion.v2_80,
		}).getFactory(),
	);
	const main = asAlpha(provider.trees[1].viewWith(stringArrayConfig));
	main.initialize(["initial"]);
	provider.synchronizeMessages();
	const peer = asAlpha(provider.trees[0].viewWith(stringArrayConfig));
	const parent = toIdCompressorWithCore(provider.getCompressor(provider.trees[1]));
	const content = {
		tree: TreeAlpha.exportCompressed(main.root, {
			idCompressor: parent,
			minVersionForCollab: FluidClientVersion.v2_80,
		}),
		schema: extractPersistedSchema(
			stringArrayConfig.schema,
			FluidClientVersion.v2_80,
			() => false,
		),
	};

	/** Loads the earlier baseline with a new child ID space shard of the Host's current compressor state. */
	const createGuest = () => {
		const [serializedIdSpaceShard] = parent.shard(1);
		assert(serializedIdSpaceShard !== undefined, "Expected a serialized child ID space shard");
		const idSpaceShard = deserializeIdCompressor(
			serializedIdSpaceShard,
			SerializationVersion.V3,
		);
		const guest = independentInitializedView(
			stringArrayConfig,
			{ jsonValidator: FormatValidatorBasic },
			{
				...content,
				tree: structuredClone(content.tree),
				idCompressor: idSpaceShard,
			},
		);
		assert.notEqual(idSpaceShard, parent);
		assert.equal(idSpaceShard.localSessionId, parent.localSessionId);
		return { idSpaceShard: toIdCompressorWithCore(idSpaceShard), guest };
	};

	return { provider, main, peer, parent, createGuest };
}

// These tests isolate compressor compatibility from the sandbox message protocol.
// sandboxing.spec.ts covers the corresponding successful protocol paths.
describe("Sandbox ID-compressor compatibility", () => {
	it("loads a compressed baseline with an independent child ID space shard", () => {
		const { main, peer, parent, createGuest } = createCompatibilityFixture();
		const { idSpaceShard, guest } = createGuest();
		try {
			assert.deepEqual([...guest.root], ["initial"]);
		} finally {
			guest.dispose();
			parent.synchronizeWithShard(
				idSpaceShard.disposeShard() ??
					assert.fail("Expected child ID space shard disposal token"),
			);
			peer.dispose();
			main.dispose();
		}
	});

	it("replays a retained Host commit encoded before ID space sharding", () => {
		const { main, peer, parent, createGuest } = createCompatibilityFixture();
		main.root.push("before ID space sharding");
		const mainCheckout = getCheckout(main);
		const commit = mainCheckout.serializeCommit(mainCheckout.mainBranch.getHead());
		const { idSpaceShard, guest } = createGuest();
		try {
			guest.applyChange(commit);
			assert.deepEqual([...guest.root], [...main.root]);
		} finally {
			guest.dispose();
			parent.synchronizeWithShard(
				idSpaceShard.disposeShard() ??
					assert.fail("Expected child ID space shard disposal token"),
			);
			peer.dispose();
			main.dispose();
		}
	});

	it("applies a Guest change after synchronizing its ID space shard with the Host", () => {
		const { main, peer, parent, createGuest } = createCompatibilityFixture();
		const { idSpaceShard, guest } = createGuest();
		try {
			let change: JsonCompatibleReadOnly | undefined;
			const unsubscribe = guest.events.on("changed", (metadata) => {
				if (metadata.isLocal) {
					change = metadata.getChange();
				}
			});
			guest.root.push("guest");
			unsubscribe();
			const serializedChange = change ?? assert.fail("Expected a serialized Guest change");
			const revision = getCheckout(guest).mainBranch.getHead().revision;
			assert(revision !== "root");
			assert.throws(() => parent.decompress(revision), /Unknown ID/);
			// A failed public view.applyChange breaks the view; the checkout uses the same decoder without breaking it.
			assert.throws(
				() => getCheckout(main).applyChange(serializedChange),
				/Unknown op space ID/,
			);
			assert.deepEqual([...main.root], ["initial"]);
			parent.synchronizeWithShard(
				idSpaceShard.getShardSyncToken() ??
					assert.fail("Expected child ID space shard synchronization token"),
			);
			main.applyChange(serializedChange);
			assert.deepEqual([...main.root], [...guest.root]);
		} finally {
			guest.dispose();
			parent.synchronizeWithShard(
				idSpaceShard.disposeShard() ??
					assert.fail("Expected child ID space shard disposal token"),
			);
			peer.dispose();
			main.dispose();
		}
	});

	it("cannot apply a later Host commit without updating the child ID space shard", () => {
		const { main, peer, parent, createGuest } = createCompatibilityFixture();
		const { idSpaceShard, guest } = createGuest();
		try {
			// Guest ID space shard initialization can backfill early Host IDs, so move beyond that incidental coverage.
			for (let i = 0; i < 32; i++) {
				parent.generateCompressedId();
			}
			main.root.push("host");
			const mainCheckout = getCheckout(main);
			const revision = mainCheckout.mainBranch.getHead().revision;
			assert(revision !== "root");
			assert.throws(() => idSpaceShard.decompress(revision), /Unknown ID/);
			const commit = mainCheckout.serializeCommit(mainCheckout.mainBranch.getHead());
			assert.throws(() => getCheckout(guest).applyChange(commit), /Unknown op space ID/);
			assert.deepEqual([...guest.root], ["initial"]);
		} finally {
			guest.dispose();
			parent.synchronizeWithShard(
				idSpaceShard.disposeShard() ??
					assert.fail("Expected child ID space shard disposal token"),
			);
			peer.dispose();
			main.dispose();
		}
	});

	it("cannot apply a peer commit finalized after ID space sharding without updating the child ID space shard", () => {
		const { provider, main, peer, parent, createGuest } = createCompatibilityFixture();
		const { idSpaceShard, guest } = createGuest();
		try {
			peer.root.push("peer");
			provider.synchronizeMessages();
			const mainCheckout = getCheckout(main);
			const commit = mainCheckout.serializeCommit(mainCheckout.mainBranch.getHead());
			assert.throws(() => getCheckout(guest).applyChange(commit), /Unknown op space ID/);
			assert.deepEqual([...guest.root], ["initial"]);
		} finally {
			guest.dispose();
			parent.synchronizeWithShard(
				idSpaceShard.disposeShard() ??
					assert.fail("Expected child ID space shard disposal token"),
			);
			peer.dispose();
			main.dispose();
		}
	});
});
