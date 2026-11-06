/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	SummaryType,
	type ISummaryBlob,
	type ISummaryTree,
} from "@fluidframework/driver-definitions";
import { createMemoryService } from "@fluidframework/sea-typescript/internal";

import { SeaDocumentStorage, SeaSessionDriverClient } from "../index.js";
import { bytesToHex } from "../lifecycleHelpers.js";

/** Builds a summary tree without widening its discriminant. */
const tree = (entries: ISummaryTree["tree"]): ISummaryTree => ({
	type: SummaryType.Tree,
	tree: entries,
});
const blob = (content: string): ISummaryBlob => ({ type: SummaryType.Blob, content });

describe("SEA direct incremental summary storage", () => {
	let service: Awaited<ReturnType<typeof createMemoryService>>;
	let client: SeaSessionDriverClient;
	let storage: SeaDocumentStorage;
	let blobUploads: number;
	let directoryUploads: number;
	const directoryReads: string[] = [];

	beforeEach(async () => {
		service = await createMemoryService({ environment: "node" });
		client = new SeaSessionDriverClient(service.open, "clientSelected");
		await client.create();
		storage = new SeaDocumentStorage(client);
		blobUploads = 0;
		directoryUploads = 0;
		directoryReads.length = 0;
		const uploadBlob = client.uploadBlob.bind(client);
		client.uploadBlob = async (payload) => {
			blobUploads++;
			return uploadBlob(payload);
		};
		const uploadDirectory = client.uploadDirectory.bind(client);
		client.uploadDirectory = async (entries) => {
			directoryUploads++;
			return uploadDirectory(entries);
		};
		const fetchDirectory = client.fetchDirectory.bind(client);
		client.fetchDirectory = async (digest) => {
			directoryReads.push(bytesToHex(digest));
			return fetchDirectory(digest);
		};
	});

	afterEach(async () => {
		client.disconnect();
		await client.reconnect();
		service.close();
	});

	it("reuses subtree identities without reading descendants or rebuilding directories", async () => {
		const base = await storage.uploadSummaryTree(
			tree({
				stable: tree({ nested: tree({ leaf: blob("retained") }) }),
				single: blob("single"),
				empty: tree({}),
			}),
		);
		const entries = await client.fetchDirectory(base);
		const attachment = await client.uploadBlob(new TextEncoder().encode("attachment"));
		blobUploads = 0;
		directoryUploads = 0;
		directoryReads.length = 0;
		const root = await storage.uploadSummaryTree(
			tree({
				moved: { type: SummaryType.Handle, handleType: SummaryType.Tree, handle: "/stable" },
				empty: { type: SummaryType.Handle, handleType: SummaryType.Tree, handle: "/empty" },
				copied: { type: SummaryType.Handle, handleType: SummaryType.Blob, handle: "/single" },
				attachment: { type: SummaryType.Attachment, id: bytesToHex(attachment.digest) },
				changed: tree({ leaf: blob("new") }),
			}),
			base,
		);
		assert.equal(blobUploads, 1);
		assert.equal(directoryUploads, 2, "only changed and root directories are composed");
		assert.deepEqual(
			directoryReads,
			[bytesToHex(base)],
			"reuse must not read subtree contents",
		);
		const result = await client.fetchDirectory(root);
		assert.deepEqual(
			result.find((entry) => entry.name === "moved")?.child,
			entries.find((entry) => entry.name === "stable")?.child,
		);
		assert.deepEqual(
			result.find((entry) => entry.name === "empty")?.child,
			entries.find((entry) => entry.name === "empty")?.child,
		);
		assert.equal((await client.fetchSummary(root)).length, 4);
	});

	it("shares ancestor lookups between nested handles", async () => {
		const base = await storage.uploadSummaryTree(
			tree({ ancestor: tree({ left: blob("left"), right: blob("right") }) }),
		);
		blobUploads = 0;
		directoryUploads = 0;
		await storage.uploadSummaryTree(
			tree({
				a: {
					type: SummaryType.Handle,
					handleType: SummaryType.Blob,
					handle: "/ancestor/left",
				},
				b: {
					type: SummaryType.Handle,
					handleType: SummaryType.Blob,
					handle: "/ancestor/right",
				},
				all: { type: SummaryType.Handle, handleType: SummaryType.Tree, handle: "/" },
			}),
			base,
		);
		assert.equal(directoryReads.length, 2);
		assert.equal(new Set(directoryReads).size, 2);
		assert.equal(blobUploads, 0);
		assert.equal(directoryUploads, 1);
	});

	it("validates missing bases, missing paths, and handle kinds before uploading", async () => {
		const base = await storage.uploadSummaryTree(tree({ leaf: blob("value") }));
		for (const [root, handle, handleType] of [
			[undefined, "/leaf", SummaryType.Blob],
			[base, "/missing", SummaryType.Blob],
			[base, "/leaf", SummaryType.Tree],
			[base, "/", SummaryType.Blob],
			[base, "/../leaf", SummaryType.Blob],
		] as const) {
			blobUploads = 0;
			directoryUploads = 0;
			await assert.rejects(
				storage.uploadSummaryTree(
					tree({
						changed: blob("must not upload"),
						bad: { type: SummaryType.Handle, handleType, handle },
					}),
					root,
				),
				/summary handle/u,
			);
			assert.equal(blobUploads, 0);
			assert.equal(directoryUploads, 0);
		}
	});
});
