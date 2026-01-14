/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { IdCompressor } from "../idCompressor.js";
import type { SessionSpaceCompressedId } from "../index.js";
import { createSessionId } from "../utilities.js";

import { isLocalId } from "./testCommon.js";

describe("IdCompressor Sharding", () => {
	describe("Basic Sharding", () => {
		it("can create shards", () => {
			const sessionId = createSessionId();
			const parent = new IdCompressor(sessionId, undefined);

			// Generate some IDs before sharding
			const id1 = parent.generateCompressedId();
			const id2 = parent.generateCompressedId();
			const id3 = parent.generateCompressedId();

			assert(isLocalId(id1));
			assert(isLocalId(id2));
			assert(isLocalId(id3));

			// Create 2 shards (parent + 2 children = 3 total)
			const shards = parent.shard(2);
			assert.equal(shards.length, 2);

			// Verify parent's shard ID
			const parentShardId = parent.shardId();
			assert(parentShardId !== undefined);
			assert.equal(parentShardId.shardId, 0);
			assert.equal(parentShardId.generatedIdCount, 3);
		});

		it("generates IDs with stride pattern", () => {
			const sessionId = createSessionId();
			const parent = new IdCompressor(sessionId, undefined);

			// Create 2 shards (stride = 3)
			const [serializedChild1, serializedChild2] = parent.shard(2);

			const child1 = IdCompressor.deserialize({ serialized: serializedChild1 });
			const child2 = IdCompressor.deserialize({ serialized: serializedChild2 });

			// Parent (offset=0): should generate -1, -4, -7, ...
			const parentId1 = parent.generateCompressedId();
			assert.equal(parentId1, -1);
			const parentId2 = parent.generateCompressedId();
			assert.equal(parentId2, -4);

			// Child 1 (offset=1): should generate -2, -5, -8, ...
			const child1Id1 = child1.generateCompressedId();
			assert.equal(child1Id1, -2);
			const child1Id2 = child1.generateCompressedId();
			assert.equal(child1Id2, -5);

			// Child 2 (offset=2): should generate -3, -6, -9, ...
			const child2Id1 = child2.generateCompressedId();
			assert.equal(child2Id1, -3);
			const child2Id2 = child2.generateCompressedId();
			assert.equal(child2Id2, -6);

			// Verify no collisions
			const allIds = [parentId1, parentId2, child1Id1, child1Id2, child2Id1, child2Id2];
			const uniqueIds = new Set(allIds);
			assert.equal(uniqueIds.size, allIds.length, "All IDs should be unique");
		});

		it("no eager finals during sharding", () => {
			const sessionId = createSessionId();
			const parent = new IdCompressor(sessionId, undefined);

			// Generate and finalize some IDs to create a cluster
			parent.generateCompressedId();
			parent.generateCompressedId();
			const range = parent.takeNextCreationRange();
			parent.finalizeCreationRange(range);

			// Now parent has a cluster with capacity, normally would generate eager finals
			// But after sharding, should only generate local IDs
			parent.shard(1);

			const id1 = parent.generateCompressedId();
			const id2 = parent.generateCompressedId();
			const id3 = parent.generateCompressedId();

			// All should be local IDs despite cluster availability
			assert(isLocalId(id1));
			assert(isLocalId(id2));
			assert(isLocalId(id3));
		});
	});

	describe("Unsharding", () => {
		it("can unshard and resume normal operation", () => {
			const sessionId = createSessionId();
			const parent = new IdCompressor(sessionId, undefined);

			// Create shards
			const [serializedChild] = parent.shard(1);
			const child = IdCompressor.deserialize({ serialized: serializedChild });

			// Generate IDs in child
			child.generateCompressedId(); // -2
			child.generateCompressedId(); // -4

			const childShardId = child.shardId();
			assert(childShardId !== undefined);
			assert.equal(childShardId.generatedIdCount, 2);

			// Unshard
			parent.unshard(childShardId);

			// Parent should now exit sharding mode
			assert.equal(parent.shardId(), undefined);

			// Next ID should be -5 (continuing from where shards left off)
			const nextId = parent.generateCompressedId();
			assert.equal(nextId, -5);
		});

		it("merges normalizer state correctly", () => {
			const sessionId = createSessionId();
			const parent = new IdCompressor(sessionId, undefined);

			// Create shards (stride=2)
			const [serializedChild] = parent.shard(1);
			const child = IdCompressor.deserialize({ serialized: serializedChild });

			// Parent generates -1, child generates -2
			parent.generateCompressedId(); // -1
			child.generateCompressedId(); // -2

			// Get child's shard ID
			const childShardId = child.shardId();
			assert(childShardId !== undefined);

			// Unshard child
			parent.unshard(childShardId);

			// Parent should now know about both IDs
			// This is tested implicitly by decompress working
			const uuid1 = parent.decompress(-1 as SessionSpaceCompressedId);
			const uuid2 = parent.decompress(-2 as SessionSpaceCompressedId);

			assert(uuid1 !== undefined);
			assert(uuid2 !== undefined);
			assert(uuid1 !== uuid2);
		});

		it("handles empty shards", () => {
			const sessionId = createSessionId();
			const parent = new IdCompressor(sessionId, undefined);

			// Create shard
			const [serializedChild] = parent.shard(1);
			const child = IdCompressor.deserialize({ serialized: serializedChild });

			// Don't generate any IDs in child
			const childShardId = child.shardId();
			assert(childShardId !== undefined);
			assert.equal(childShardId.generatedIdCount, 0);

			// Unshard empty child
			parent.unshard(childShardId);

			// Should still work
			const nextId = parent.generateCompressedId();
			assert.equal(nextId, -1);
		});

		it("handles unsharding in any order", () => {
			const sessionId = createSessionId();
			const parent = new IdCompressor(sessionId, undefined);

			// Create 3 shards
			const [s1, s2, s3] = parent.shard(3);
			const child1 = IdCompressor.deserialize({ serialized: s1 });
			const child2 = IdCompressor.deserialize({ serialized: s2 });
			const child3 = IdCompressor.deserialize({ serialized: s3 });

			// Generate IDs
			child1.generateCompressedId();
			child2.generateCompressedId();
			child2.generateCompressedId();
			child3.generateCompressedId();
			child3.generateCompressedId();
			child3.generateCompressedId();

			// Unshard in reverse order
			parent.unshard(child3.shardId()!);
			parent.unshard(child1.shardId()!);
			parent.unshard(child2.shardId()!);

			// Should have exited sharding mode
			assert.equal(parent.shardId(), undefined);

			// localGenCount should be max of all shards: 3*4 = 12
			const nextId = parent.generateCompressedId();
			assert.equal(nextId, -13);
		});
	});

	describe("Recursive Sharding", () => {
		it("supports recursive sharding", () => {
			const sessionId = createSessionId();
			const parent = new IdCompressor(sessionId, undefined);

			// First shard: create 2 children (stride=3)
			const [child1Ser] = parent.shard(2);

			// Parent now has stride=3, offset=0
			const parentId1 = parent.generateCompressedId();
			assert.equal(parentId1, -1);

			// Second shard on parent: create 1 more child (stride=6)
			const [child3Ser] = parent.shard(1);

			// Parent now has stride=6, offset=0
			const parentId2 = parent.generateCompressedId();
			assert.equal(parentId2, -7); // Next in stride=6 sequence from -1

			// Child3 has stride=6, offset=3
			const child3 = IdCompressor.deserialize({ serialized: child3Ser });
			const child3Id = child3.generateCompressedId();
			assert.equal(child3Id, -4); // First in stride=6, offset=3 sequence

			// Child1 still has stride=3, offset=1 (unaffected by second shard)
			const child1 = IdCompressor.deserialize({ serialized: child1Ser });
			const child1Id = child1.generateCompressedId();
			assert.equal(child1Id, -2); // First in stride=3, offset=1 sequence
		});
	});

	describe("Serialization", () => {
		it("serializes and deserializes sharding state", () => {
			const sessionId = createSessionId();
			const parent = new IdCompressor(sessionId, undefined);

			// Create shards
			parent.shard(2);

			// Generate some IDs
			parent.generateCompressedId();
			parent.generateCompressedId();

			// Serialize
			const serialized = parent.serialize(true);

			// Deserialize
			const restored = IdCompressor.deserialize({ serialized });

			// Verify sharding state preserved
			const restoredShardId = restored.shardId();
			assert(restoredShardId !== undefined);
			assert.equal(restoredShardId.shardId, 0);
			assert.equal(restoredShardId.generatedIdCount, 2);

			// Verify can continue generating with correct stride
			const nextId = restored.generateCompressedId();
			assert.equal(nextId, -7); // stride=3, third ID for offset=0
		});

		it("handles version 2 documents without sharding state", () => {
			const sessionId = createSessionId();
			const compressor = new IdCompressor(sessionId, undefined);

			// Generate some IDs
			compressor.generateCompressedId();
			compressor.generateCompressedId();

			// This would be a version 2 document (no sharding)
			// When deserialized in version 3 code, should work fine
			const serialized = compressor.serialize(true);
			const restored = IdCompressor.deserialize({ serialized });

			// Should have no sharding state
			assert.equal(restored.shardId(), undefined);

			// Should work normally
			const id = restored.generateCompressedId();
			assert.equal(id, -3);
		});
	});
});
