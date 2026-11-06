/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { setTimeout: delay } = require("node:timers/promises");

const requireTests = createRequire(
	path.join(__dirname, "../packages/test/test-end-to-end-tests/package.json"),
);
const requireTinylicious = createRequire(requireTests.resolve("tinylicious"));

test("Tinylicious query paths preserve nested filtering, sorting, and updates", async () => {
	const { Collection } = requireTinylicious("./services/inMemorycollection");
	const collection = new Collection();
	await collection.insertMany(
		[
			{ _id: "one", tenantId: "a", operation: { sequenceNumber: 1 } },
			{ _id: "two", tenantId: "a", operation: { sequenceNumber: 2 } },
			{ _id: "three", tenantId: "b", operation: { sequenceNumber: 3 } },
			{ _id: "four", tenantId: "a", operation: { sequenceNumber: 4 } },
		],
		true,
	);
	const query = { tenantId: "a", "operation.sequenceNumber": { $gt: 1, $lt: 5 } };
	const descending = { "operation.sequenceNumber": -1 };
	assert.deepEqual(
		(await collection.find(query, descending)).map((row) => row._id),
		["four", "two"],
	);
	assert.equal((await collection.findOne({ "operation.sequenceNumber": 2 }))._id, "two");
	await collection.update({ _id: "two" }, { operation: { sequenceNumber: 5 } });
	assert.deepEqual(
		(await collection.find(query, descending)).map((row) => row._id),
		["four"],
	);
	assert.deepEqual(
		(await collection.find({}, { "operation.sequenceNumber": 1 })).map((row) => row._id),
		["one", "three", "four", "two"],
	);
	await collection.deleteMany({ tenantId: "a" });
	assert.deepEqual(
		(await collection.findAll()).map((row) => row._id),
		["three"],
	);
});

test("Tinylicious waits for a concurrent loose-object write before reading it", {
	timeout: 10000,
}, async () => {
	const git = requireTinylicious("isomorphic-git");
	const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "tinylicious-object-write-"));
	let releaseWrite;
	const writeMayFinish = new Promise((resolve) => {
		releaseWrite = resolve;
	});
	let signalWriteStarted;
	const writeStarted = new Promise((resolve) => {
		signalWriteStarted = resolve;
	});
	let intercepted = false;
	let writeFinished = false;
	let readIncompleteObject = false;
	const isLooseObject = (file) =>
		/[\\/]objects[\\/][a-f0-9]{2}[\\/][a-f0-9]{38}$/.test(String(file));
	const testFs = {
		...fs,
		promises: {
			...fs.promises,
			async writeFile(file, contents, options) {
				if (!intercepted && isLooseObject(file)) {
					// Expose the object name before its compressed contents are complete.
					await fs.promises.writeFile(file, Buffer.alloc(0), options);
					intercepted = true;
					signalWriteStarted();
					await writeMayFinish;
					await fs.promises.writeFile(file, contents, options);
					writeFinished = true;
					return;
				}
				return fs.promises.writeFile(file, contents, options);
			},
			async readFile(file, options) {
				if (isLooseObject(file) && !writeFinished) {
					readIncompleteObject = true;
				}
				return fs.promises.readFile(file, options);
			},
		},
	};
	const pending = [];
	try {
		await git.init({ fs, dir });
		const blob = await git.writeBlob({ fs, dir, blob: Buffer.from("storage regression") });
		const tree = [{ mode: "100644", path: "entry", oid: blob, type: "blob" }];
		const writeAndRead = async () => {
			const oid = await git.writeTree({ fs: testFs, dir, tree });
			return git.readTree({ fs: testFs, dir, oid });
		};
		const first = writeAndRead();
		pending.push(first);
		await Promise.race([writeStarted, first]);
		assert.equal(intercepted, true);
		pending.push(writeAndRead());
		const resultsPromise = Promise.allSettled(pending);
		await delay(100);
		releaseWrite();
		const results = await resultsPromise;
		assert.equal(readIncompleteObject, false, "A concurrent caller read a partial object");
		for (const result of results) {
			assert.equal(result.status, "fulfilled", String(result.reason));
			assert.deepEqual(result.value.tree, tree);
		}
	} finally {
		releaseWrite();
		await Promise.allSettled(pending);
		await fs.promises.rm(dir, { recursive: true, force: true });
	}
});

test("A rejected object write releases the lock and still reports the error", {
	timeout: 10000,
}, async () => {
	const git = requireTinylicious("isomorphic-git");
	const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "tinylicious-write-error-"));
	let rejectWrites = true;
	const testFs = {
		...fs,
		promises: {
			...fs.promises,
			async writeFile(file, contents, options) {
				if (rejectWrites && /[\\/]objects[\\/]/.test(String(file))) {
					throw Object.assign(new Error("deliberate object write failure"), { code: "EIO" });
				}
				return fs.promises.writeFile(file, contents, options);
			},
		},
	};
	try {
		await git.init({ fs, dir });
		await assert.rejects(
			git.writeBlob({ fs: testFs, dir, blob: Buffer.from("retry") }),
			/deliberate object write failure/,
		);
		rejectWrites = false;
		const oid = await git.writeBlob({ fs: testFs, dir, blob: Buffer.from("retry") });
		const result = await git.readBlob({ fs: testFs, dir, oid });
		assert.equal(Buffer.from(result.blob).toString(), "retry");
	} finally {
		await fs.promises.rm(dir, { recursive: true, force: true });
	}
});
