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
import { TestTreeProviderLite } from "../../utils.js";

import { stringArrayConfig } from "./sandboxingTestUtils.js";
import { getBranch, getCheckout, serializeCommit } from "./synchronizationUtils.js";

/**
 * Creates a Host, peer, and compressed baseline before the Guest shard exists.
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

	/** Loads the earlier baseline with a new child shard of the Host's current compressor state. */
	const createGuest = () => {
		const [serialized] = parent.shard(1);
		assert(serialized !== undefined, "Expected a serialized child shard");
		const child = deserializeIdCompressor(serialized, SerializationVersion.V3);
		const guest = independentInitializedView(
			stringArrayConfig,
			{ jsonValidator: FormatValidatorBasic },
			{
				...content,
				tree: structuredClone(content.tree),
				idCompressor: child,
			},
		);
		assert.notEqual(child, parent);
		assert.equal(child.localSessionId, parent.localSessionId);
		return { child: toIdCompressorWithCore(child), guest };
	};

	return { provider, main, peer, parent, createGuest };
}

// These tests isolate compressor compatibility from the sandbox message protocol.
describe("Sandbox ID-compressor compatibility", () => {
	it("loads a compressed baseline with an independent child shard", () => {
		// TODO: Load the shard from hostInitialization over MessagePort instead of injecting it here.
		const { main, peer, parent, createGuest } = createCompatibilityFixture();
		const { child, guest } = createGuest();
		try {
			assert.deepEqual([...guest.root], ["initial"]);
		} finally {
			guest.dispose();
			parent.synchronizeWithShard(child.disposeShard() ?? assert.fail("Expected child token"));
			peer.dispose();
			main.dispose();
		}
	});

	it("replays a retained Host commit encoded before sharding", () => {
		// TODO: Replay retained history through hostInitialization with a separately deserialized shard.
		const { main, peer, parent, createGuest } = createCompatibilityFixture();
		main.root.push("before shard");
		const commit = serializeCommit(main, getBranch(main).getHead());
		const { child, guest } = createGuest();
		try {
			guest.applyChange(commit);
			assert.deepEqual([...guest.root], [...main.root]);
		} finally {
			guest.dispose();
			parent.synchronizeWithShard(child.disposeShard() ?? assert.fail("Expected child token"));
			peer.dispose();
			main.dispose();
		}
	});

	it("applies a Guest change after synchronizing its shard with the Host", () => {
		// TODO: Carry the sync token on guestChange and validate it before applying the change.
		const { main, peer, parent, createGuest } = createCompatibilityFixture();
		const { child, guest } = createGuest();
		try {
			let change: ReturnType<typeof serializeCommit> | undefined;
			const unsubscribe = guest.events.on("changed", (metadata) => {
				if (metadata.isLocal) {
					change = metadata.getChange();
				}
			});
			guest.root.push("guest");
			unsubscribe();
			const serializedChange = change ?? assert.fail("Expected a serialized Guest change");
			const revision = getBranch(guest).getHead().revision;
			assert(revision !== "root");
			assert.throws(() => parent.decompress(revision), /Unknown ID/);
			// A failed public view.applyChange breaks the view; the checkout uses the same decoder without breaking it.
			assert.throws(
				() => getCheckout(main).applyChange(serializedChange),
				/Unknown op space ID/,
			);
			assert.deepEqual([...main.root], ["initial"]);
			parent.synchronizeWithShard(
				child.getShardSyncToken() ?? assert.fail("Expected child synchronization token"),
			);
			main.applyChange(serializedChange);
			assert.deepEqual([...main.root], [...guest.root]);
		} finally {
			guest.dispose();
			parent.synchronizeWithShard(child.disposeShard() ?? assert.fail("Expected child token"));
			peer.dispose();
			main.dispose();
		}
	});

	it("cannot apply a later Host commit without updating the child shard", () => {
		// TODO: Supply Host ID progress to the child before applying this commit; expect success instead.
		const { main, peer, parent, createGuest } = createCompatibilityFixture();
		const { child, guest } = createGuest();
		try {
			// Guest initialization can backfill early Host IDs, so move beyond that incidental coverage.
			for (let i = 0; i < 32; i++) {
				parent.generateCompressedId();
			}
			main.root.push("host");
			const revision = getBranch(main).getHead().revision;
			assert(revision !== "root");
			assert.throws(() => child.decompress(revision), /Unknown ID/);
			const commit = serializeCommit(main, getBranch(main).getHead());
			assert.throws(() => getCheckout(guest).applyChange(commit), /Unknown op space ID/);
			assert.deepEqual([...guest.root], ["initial"]);
		} finally {
			guest.dispose();
			parent.synchronizeWithShard(child.disposeShard() ?? assert.fail("Expected child token"));
			peer.dispose();
			main.dispose();
		}
	});

	it("cannot apply a peer commit finalized after sharding without updating the child", () => {
		// TODO: Deliver finalized peer ranges to the child before applying this commit; expect success instead.
		const { provider, main, peer, parent, createGuest } = createCompatibilityFixture();
		const { child, guest } = createGuest();
		try {
			peer.root.push("peer");
			provider.synchronizeMessages();
			const commit = serializeCommit(main, getBranch(main).getHead());
			assert.throws(() => getCheckout(guest).applyChange(commit), /Unknown op space ID/);
			assert.deepEqual([...guest.root], ["initial"]);
		} finally {
			guest.dispose();
			parent.synchronizeWithShard(child.disposeShard() ?? assert.fail("Expected child token"));
			peer.dispose();
			main.dispose();
		}
	});
});
