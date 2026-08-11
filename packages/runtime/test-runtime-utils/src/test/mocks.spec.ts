/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";

import { MockHandle } from "../mockHandle.js";
import {
	createSnapshotTreeFromContents,
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
} from "../mocks.js";

describe("MockContainerRuntime", () => {
	it("inherits its id from the datastore when set", () => {
		const id = "example test id";
		const factory = new MockContainerRuntimeFactory();
		const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: id });
		const containerRuntime = factory.createContainerRuntime(dataStoreRuntime);
		assert.equal(containerRuntime.clientId, id);
	});

	it("generates and finalizes IdCreationRanges when generating an op", () => {
		const firstIdCompressor = createIdCompressor();
		const secondIdCompressor = createIdCompressor();
		const factory = new MockContainerRuntimeFactory();
		const firstDataStoreRuntime = new MockFluidDataStoreRuntime({
			idCompressor: firstIdCompressor,
		});
		const secondDataStoreRuntime = new MockFluidDataStoreRuntime({
			idCompressor: secondIdCompressor,
		});

		const firstContainerRuntime = factory.createContainerRuntime(firstDataStoreRuntime);
		const secondContainerRuntime = factory.createContainerRuntime(secondDataStoreRuntime);
		// Generate an ID in the first client
		const id = firstIdCompressor.generateCompressedId();
		const opSpaceId = firstIdCompressor.normalizeToOpSpace(id);

		// Generate an ID in the first client
		const secondId = secondIdCompressor.generateCompressedId();
		const secondOpSpaceId = secondIdCompressor.normalizeToOpSpace(secondId);

		// Generate a "dummy" op to trigger IdAllocationOp
		firstContainerRuntime.submit({}, undefined);
		secondContainerRuntime.submit({}, undefined);

		factory.processAllMessages();

		const normalizedId = secondDataStoreRuntime.idCompressor?.normalizeToSessionSpace(
			opSpaceId,
			firstIdCompressor.localSessionId,
		);

		const secondNormalizedId = firstDataStoreRuntime.idCompressor?.normalizeToSessionSpace(
			secondOpSpaceId,
			secondIdCompressor.localSessionId,
		);

		assert.strictEqual(normalizedId, 0, "Should have finalized the ID in both containers.");
		assert.strictEqual(
			secondNormalizedId,
			513,
			"Should have finalized the ID in both containers.",
		);
	});

	it("MockHandle is handle", () => {
		assert(isFluidHandle(new MockHandle(5)));
	});
});

describe("createSnapshotTreeFromContents", () => {
	it("creates empty snapshot tree from empty contents", () => {
		const contents = {};
		const snapshotTree = createSnapshotTreeFromContents(contents);

		assert.deepStrictEqual(snapshotTree, {
			trees: {},
			blobs: {},
		});
	});

	it("creates snapshot tree with single blob at root", () => {
		const contents = {
			"blob1": "content1",
		};
		const snapshotTree = createSnapshotTreeFromContents(contents);

		assert.deepStrictEqual(snapshotTree, {
			trees: {},
			blobs: {
				"blob1": "content1",
			},
		});
	});

	it("creates snapshot tree with multiple blobs at root", () => {
		const contents = {
			"blob1": "content1",
			"blob2": "content2",
		};
		const snapshotTree = createSnapshotTreeFromContents(contents);

		assert.deepStrictEqual(snapshotTree, {
			trees: {},
			blobs: {
				"blob1": "content1",
				"blob2": "content2",
			},
		});
	});

	it("creates snapshot tree with single level directory", () => {
		const contents = {
			"dir1/blob": "content1",
		};
		const snapshotTree = createSnapshotTreeFromContents(contents);

		assert.deepStrictEqual(snapshotTree, {
			trees: {
				dir1: {
					trees: {},
					blobs: {
						"blob": "content1",
					},
				},
			},
			blobs: {},
		});
	});

	it("creates snapshot tree with nested directories", () => {
		const contents = {
			"dir1/subdir/blob": "content1",
		};
		const snapshotTree = createSnapshotTreeFromContents(contents);

		assert.deepStrictEqual(snapshotTree, {
			trees: {
				dir1: {
					trees: {
						subdir: {
							trees: {},
							blobs: {
								"blob": "content1",
							},
						},
					},
					blobs: {},
				},
			},
			blobs: {},
		});
	});

	it("creates snapshot tree with mixed structure", () => {
		const contents = {
			"root": "root content",
			"dir1/blob1": "content1",
			"dir1/blob2": "content2",
			"dir1/subdir/blob": "nested content",
			"dir2/blob": "other content",
		};
		const snapshotTree = createSnapshotTreeFromContents(contents);

		assert.deepStrictEqual(snapshotTree, {
			trees: {
				dir1: {
					trees: {
						subdir: {
							trees: {},
							blobs: {
								"blob": "nested content",
							},
						},
					},
					blobs: {
						"blob1": "content1",
						"blob2": "content2",
					},
				},
				dir2: {
					trees: {},
					blobs: {
						"blob": "other content",
					},
				},
			},
			blobs: {
				"root": "root content",
			},
		});
	});

	it("handles paths with trailing slashes gracefully", () => {
		const contents = {
			"dir1/blob": "content1",
		};
		const snapshotTree = createSnapshotTreeFromContents(contents);

		assert.deepStrictEqual(snapshotTree, {
			trees: {
				dir1: {
					trees: {},
					blobs: {
						"blob": "content1",
					},
				},
			},
			blobs: {},
		});
	});
});
