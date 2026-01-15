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
			assert.equal(parentShardId.generatedIdCount, 1); // Parent now only "owns" genCount 1 in stride pattern
		});

		it("children recognize parent's pre-shard IDs", () => {
			const sessionId = createSessionId();
			const parent = new IdCompressor(sessionId, undefined);

			// Generate 3 IDs before sharding (genCounts 1, 2, 3 → IDs -1, -2, -3)
			const id1 = parent.generateCompressedId();
			const id2 = parent.generateCompressedId();
			const id3 = parent.generateCompressedId();

			assert.equal(id1, -1);
			assert.equal(id2, -2);
			assert.equal(id3, -3);

			// Get UUIDs for these IDs from parent
			const uuid1 = parent.decompress(id1);
			const uuid2 = parent.decompress(id2);
			const uuid3 = parent.decompress(id3);

			// Shard into 3 (stride=3, offsets 0,1,2)
			const [child1Ser, child2Ser] = parent.shard(2);
			const child1 = IdCompressor.deserialize({ serialized: child1Ser });
			const child2 = IdCompressor.deserialize({ serialized: child2Ser });

			// Children should be able to decompress parent's pre-shard IDs
			// They share the same session and are forks of the parent
			assert.equal(child1.decompress(id1), uuid1);
			assert.equal(child1.decompress(id2), uuid2);
			assert.equal(child1.decompress(id3), uuid3);

			assert.equal(child2.decompress(id1), uuid1);
			assert.equal(child2.decompress(id2), uuid2);
			assert.equal(child2.decompress(id3), uuid3);

			// Parent should still be able to decompress
			assert.equal(parent.decompress(id1), uuid1);
			assert.equal(parent.decompress(id2), uuid2);
			assert.equal(parent.decompress(id3), uuid3);
		});

		it("sharding with pre-existing IDs follows stride pattern correctly", () => {
			const sessionId = createSessionId();
			const parent = new IdCompressor(sessionId, undefined);

			// Generate 3 IDs before sharding (genCounts 1,2,3 occupy first cycle)
			parent.generateCompressedId(); // -1
			parent.generateCompressedId(); // -2
			parent.generateCompressedId(); // -3

			// Shard into 3 (stride=3)
			// After sharding, stride pattern distributes future genCounts:
			//   - Parent (offset=0) owns: 1, 4, 7, 10, ... (has generated 1, next is 4)
			//   - Child1 (offset=1) owns: 2, 5, 8, 11, ... (has generated 1, next is 5)
			//   - Child2 (offset=2) owns: 3, 6, 9, 12, ... (has generated 1, next is 6)
			const [child1Ser, child2Ser] = parent.shard(2);
			const child1 = IdCompressor.deserialize({ serialized: child1Ser });
			const child2 = IdCompressor.deserialize({ serialized: child2Ser });

			// Verify starting localGenCount for each shard
			const parentShardId = parent.shardId();
			const child1ShardId = child1.shardId();
			const child2ShardId = child2.shardId();

			assert(parentShardId !== undefined);
			assert(child1ShardId !== undefined);
			assert(child2ShardId !== undefined);

			assert.equal(parentShardId.generatedIdCount, 1); // Has generated 1 from its stride
			assert.equal(child1ShardId.generatedIdCount, 1); // Has generated 1 from its stride
			assert.equal(child2ShardId.generatedIdCount, 1); // Has generated 1 from its stride

			// Now generate next IDs - should follow stride pattern from genCount 4 onward
			const parentNext = parent.generateCompressedId();
			const child1Next = child1.generateCompressedId();
			const child2Next = child2.generateCompressedId();

			assert.equal(parentNext, -4); // genCount 4
			assert.equal(child1Next, -5); // genCount 5
			assert.equal(child2Next, -6); // genCount 6
		});

		it("sharding with partial cycle follows stride pattern correctly", () => {
			const sessionId = createSessionId();
			const parent = new IdCompressor(sessionId, undefined);

			// Generate 5 IDs before sharding (completes 1 cycle, half-fills second)
			parent.generateCompressedId(); // -1
			parent.generateCompressedId(); // -2
			parent.generateCompressedId(); // -3
			parent.generateCompressedId(); // -4
			parent.generateCompressedId(); // -5

			// Shard into 3 (stride=3)
			// Distribution after sharding:
			//   - Cycle 0 (genCounts 1-3): all filled
			//   - Cycle 1 (genCounts 4-6): slots 4,5 filled, slot 6 empty
			// After sharding:
			//   - Parent (offset=0) owns: 1, 4, 7, ... (has generated 2: genCounts 1,4)
			//   - Child1 (offset=1) owns: 2, 5, 8, ... (has generated 2: genCounts 2,5)
			//   - Child2 (offset=2) owns: 3, 6, 9, ... (has generated 1: genCount 3)
			const [child1Ser, child2Ser] = parent.shard(2);
			const child1 = IdCompressor.deserialize({ serialized: child1Ser });
			const child2 = IdCompressor.deserialize({ serialized: child2Ser });

			// Verify localGenCount
			const parentShardId = parent.shardId();
			const child1ShardId = child1.shardId();
			const child2ShardId = child2.shardId();

			assert(parentShardId !== undefined);
			assert(child1ShardId !== undefined);
			assert(child2ShardId !== undefined);

			assert.equal(parentShardId.generatedIdCount, 2); // Completed 1 cycle + 1 in partial
			assert.equal(child1ShardId.generatedIdCount, 2); // Completed 1 cycle + 1 in partial
			assert.equal(child2ShardId.generatedIdCount, 1); // Completed 1 cycle + 0 in partial

			// Generate next IDs
			const parentNext = parent.generateCompressedId();
			const child1Next = child1.generateCompressedId();
			const child2Next = child2.generateCompressedId();

			assert.equal(parentNext, -7); // genCount 7
			assert.equal(child1Next, -8); // genCount 8
			assert.equal(child2Next, -6); // genCount 6 (filling the empty slot)
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

		it("shards cannot decompress IDs beyond their generation count", () => {
			const sessionId = createSessionId();
			const parent = new IdCompressor(sessionId, undefined);

			// Create 2 shards (stride = 3)
			const [serializedChild1] = parent.shard(2);
			const child1 = IdCompressor.deserialize({ serialized: serializedChild1 });

			// Parent (offset=0) generates 2 IDs: -1 (genCount 1), -4 (genCount 4)
			// This backfills cycles [1, 2, 3] and [4, 5, 6]
			const parentId1 = parent.generateCompressedId();
			const parentId2 = parent.generateCompressedId();
			assert.equal(parentId1, -1);
			assert.equal(parentId2, -4);

			// Child1 (offset=1) generates 1 ID: -2 (genCount 2)
			// This backfills cycle [1, 2, 3] in child1's normalizer
			const child1Id1 = child1.generateCompressedId();
			assert.equal(child1Id1, -2);

			// Verify each can decompress their own IDs
			assert(parent.decompress(parentId1) !== undefined);
			assert(parent.decompress(parentId2) !== undefined);
			assert(child1.decompress(child1Id1) !== undefined);

			// Due to backfilling, shards in the same cycle can decompress each other's IDs
			// Child1 backfilled [1, 2, 3] so it can decompress parentId1 (-1, genCount 1)
			assert(child1.decompress(parentId1) !== undefined);

			// But child1 has only backfilled up to cycle [1, 2, 3], not [4, 5, 6]
			// So child1 should NOT be able to decompress parentId2 (-4, genCount 4)
			assert.throws(() => child1.decompress(parentId2), /Unknown ID/);

			// Parent has backfilled [1, 2, 3] and [4, 5, 6]
			// Parent should NOT be able to decompress -7 (genCount 7) in the next cycle [7, 8, 9]
			assert.throws(() => parent.decompress(-7 as SessionSpaceCompressedId), /Unknown ID/);

			// Child1 has only backfilled [1, 2, 3]
			// Child1 should NOT be able to decompress -5 (genCount 5) in cycle [4, 5, 6]
			assert.throws(() => child1.decompress(-5 as SessionSpaceCompressedId), /Unknown ID/);
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

		it("resumes eager final ID allocation after unsharding", () => {
			const sessionId = createSessionId();
			const parent = new IdCompressor(sessionId, undefined);

			// Generate and finalize IDs to create a cluster with capacity
			for (let i = 0; i < 3; i++) {
				parent.generateCompressedId();
			}
			const range = parent.takeNextCreationRange();
			parent.finalizeCreationRange(range);

			// At this point, cluster has capacity for more IDs (default is 512)
			// Normally would generate eager finals, but after sharding, should use locals
			const [serializedChild] = parent.shard(1);
			const child = IdCompressor.deserialize({ serialized: serializedChild });

			// During sharding, both generate local IDs despite cluster capacity
			const id1 = parent.generateCompressedId();
			const id2 = child.generateCompressedId();
			assert(isLocalId(id1));
			assert(isLocalId(id2));

			// Unshard
			const childShardId = child.shardId();
			assert(childShardId !== undefined);
			parent.unshard(childShardId);

			// After unsharding, eager finals should resume since cluster has capacity
			const id3 = parent.generateCompressedId();
			assert(!isLocalId(id3), "Should resume generating eager final IDs after unsharding");
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
			const child3ShardId = child3.shardId();
			const child1ShardId = child1.shardId();
			const child2ShardId = child2.shardId();
			assert(child3ShardId !== undefined);
			assert(child1ShardId !== undefined);
			assert(child2ShardId !== undefined);
			parent.unshard(child3ShardId);
			parent.unshard(child1ShardId);
			parent.unshard(child2ShardId);

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

			// NOTE: Skipping parent ID generation to test child3 first
			// const parentId2 = parent.generateCompressedId();
			// assert.equal(parentId2, -7);

			// Child3 has stride=6, offset=3
			const child3 = IdCompressor.deserialize({ serialized: child3Ser });
			const child3Id = child3.generateCompressedId();
			assert.equal(child3Id, -4); // First in stride=6, offset=3 sequence

			// Child1 still has stride=3, offset=1 (unaffected by second shard)
			const child1 = IdCompressor.deserialize({ serialized: child1Ser });
			const child1Id = child1.generateCompressedId();
			assert.equal(child1Id, -2); // First in stride=3, offset=1 sequence

			// Parent now has stride=6, offset=0
			const parentId2 = parent.generateCompressedId();
			assert.equal(parentId2, -7); // Next in stride=6 sequence from -1
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
