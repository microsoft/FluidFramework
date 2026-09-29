/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type { IDocument } from "@fluidframework/server-services-core";
import * as sinon from "sinon";

import { DocumentManager } from "../services/documentManager";
import { TestCache, TestDocumentManager } from "./utils";

const tenantId = "tenant/a";
const documentId = "shared:id";
const activeDocument: IDocument = {
	version: "1.0",
	createTime: 100,
	documentId,
	tenantId,
	session: {
		ordererUrl: "http://orderer",
		deltaStreamUrl: "http://delta",
		historianUrl: "http://historian",
		isSessionAlive: false,
		isSessionActive: false,
	},
	scribe: "",
	deli: "",
	storageName: "document-storage",
	isEphemeralContainer: false,
};

describe("Historian DocumentManager", () => {
	const sandbox = sinon.createSandbox();

	afterEach(() => sandbox.restore());

	it("returns cached tenant-qualified static properties without reading Alfred", async () => {
		const authoritativeManager = new TestDocumentManager();
		const cache = new TestCache();
		await cache.set("staticData:tenant%2Fa:shared%3Aid", {
			version: activeDocument.version,
			createTime: activeDocument.createTime,
			documentId,
			tenantId,
			storageName: activeDocument.storageName,
			isEphemeralContainer: activeDocument.isEphemeralContainer,
		});
		const manager = new DocumentManager(authoritativeManager, cache);
		const readDocument = sandbox.spy(authoritativeManager, "readDocument");

		const result = await manager.readStaticPropertiesForSummary(tenantId, documentId);

		assert.strictEqual(result?.tenantId, tenantId);
		assert.strictEqual(result?.documentId, documentId);
		sinon.assert.notCalled(readDocument);
	});

	it("forwards the customer token on an authoritative cache miss", async () => {
		const authoritativeManager = new TestDocumentManager();
		const manager = new DocumentManager(authoritativeManager, new TestCache());
		const readDocument = sandbox
			.stub(authoritativeManager, "readDocument")
			.resolves(activeDocument);

		await manager.readStaticPropertiesForSummary(tenantId, documentId, {
			accessToken: "customer.jwt",
		});

		sinon.assert.calledOnceWithExactly(readDocument, tenantId, documentId, {
			accessToken: "customer.jwt",
		});
	});

	it("falls back to Alfred for malformed cached static properties", async () => {
		const authoritativeManager = new TestDocumentManager();
		const cache = new TestCache();
		await cache.set("staticData:tenant%2Fa:shared%3Aid", "{invalid");
		const manager = new DocumentManager(authoritativeManager, cache);
		const readDocument = sandbox
			.stub(authoritativeManager, "readDocument")
			.resolves(activeDocument);

		const result = await manager.readStaticPropertiesForSummary(tenantId, documentId);

		assert.strictEqual(result?.tenantId, tenantId);
		assert.strictEqual(result?.documentId, documentId);
		sinon.assert.calledOnce(readDocument);
	});

	it("does not cache or return soft-deleted document properties", async () => {
		const authoritativeManager = new TestDocumentManager();
		const cache = new TestCache();
		const cacheSet = sandbox.spy(cache, "set");
		const manager = new DocumentManager(authoritativeManager, cache);
		sandbox.stub(authoritativeManager, "readDocument").resolves({
			...activeDocument,
			scheduledDeletionTime: "2026-09-29T00:00:00.000Z",
		});

		assert.strictEqual(
			await manager.readStaticPropertiesForSummary(tenantId, documentId),
			undefined,
		);
		sinon.assert.notCalled(cacheSet);
	});

	it("denies a cached positive entry after deletion is marked", async () => {
		const authoritativeManager = new TestDocumentManager();
		const cache = new TestCache();
		await cache.set("staticData:tenant%2Fa:shared%3Aid", activeDocument);
		const manager = new DocumentManager(authoritativeManager, cache);
		const readDocument = sandbox
			.stub(authoritativeManager, "readDocument")
			.resolves(activeDocument);

		await manager.purgeStaticCache(tenantId, documentId, activeDocument.createTime);

		assert.strictEqual(
			await manager.readStaticPropertiesForSummary(tenantId, documentId),
			undefined,
		);
		sinon.assert.calledOnce(readDocument);
	});

	it("denies and removes a cached positive when deletion is marked during the cache read", async () => {
		const staticKey = "staticData:tenant%2Fa:shared%3Aid";
		const deletedKey = "deletedDocument:tenant%2Fa:shared%3Aid";
		class InterleavingCache extends TestCache {
			public override async get<T>(key: string): Promise<T> {
				const value = await super.get<T>(key);
				if (key === staticKey) {
					await this.setWithoutExpiry(deletedKey, {
						createTime: activeDocument.createTime,
					});
				}
				return value;
			}
		}
		const authoritativeManager = new TestDocumentManager();
		const cache = new InterleavingCache();
		await cache.set(staticKey, activeDocument);
		const manager = new DocumentManager(authoritativeManager, cache);
		sandbox.stub(authoritativeManager, "readDocument").resolves(activeDocument);

		assert.strictEqual(
			await manager.readStaticPropertiesForSummary(tenantId, documentId),
			undefined,
		);
		assert.strictEqual(await cache.get(staticKey), undefined);
	});

	it("denies and removes an authoritative result when deletion is marked during cache population", async () => {
		const staticKey = "staticData:tenant%2Fa:shared%3Aid";
		const deletedKey = "deletedDocument:tenant%2Fa:shared%3Aid";
		class InterleavingCache extends TestCache {
			public override async set<T>(key: string, value: T): Promise<void> {
				await super.set(key, value);
				if (key === staticKey) {
					await this.setWithoutExpiry(deletedKey, {
						createTime: activeDocument.createTime,
					});
				}
			}
		}
		const authoritativeManager = new TestDocumentManager();
		const cache = new InterleavingCache();
		const manager = new DocumentManager(authoritativeManager, cache);
		sandbox.stub(authoritativeManager, "readDocument").resolves(activeDocument);

		assert.strictEqual(
			await manager.readStaticPropertiesForSummary(tenantId, documentId),
			undefined,
		);
		assert.strictEqual(await cache.get(staticKey), undefined);
	});

	it("keeps a deletion marker durable while allowing a newly created document generation", async () => {
		const authoritativeManager = new TestDocumentManager();
		const cache = new TestCache();
		const manager = new DocumentManager(authoritativeManager, cache);
		const recreatedDocument = { ...activeDocument, createTime: 200 };
		sandbox.stub(authoritativeManager, "readDocument").resolves(recreatedDocument);

		await manager.purgeStaticCache(tenantId, documentId, activeDocument.createTime);
		await cache.delete("staticData:tenant%2Fa:shared%3Aid");

		assert.deepStrictEqual(await manager.readStaticPropertiesForSummary(tenantId, documentId), {
			version: recreatedDocument.version,
			createTime: recreatedDocument.createTime,
			documentId,
			tenantId,
			storageName: recreatedDocument.storageName,
			isEphemeralContainer: recreatedDocument.isEphemeralContainer,
		});
		assert.strictEqual(await cache.get("deletedDocument:tenant%2Fa:shared%3Aid"), undefined);
	});

	it("does not clear a concurrent deletion marker for a recreated document", async () => {
		const deletedKey = "deletedDocument:tenant%2Fa:shared%3Aid";
		class InterleavingCache extends TestCache {
			public override async deleteIfValueMatches<T>(key: string, value: T): Promise<boolean> {
				if (key === deletedKey) {
					await this.setWithoutExpiry(key, { createTime: 200 });
					return false;
				}
				return super.deleteIfValueMatches(key, value);
			}
		}
		const authoritativeManager = new TestDocumentManager();
		const cache = new InterleavingCache();
		const manager = new DocumentManager(authoritativeManager, cache);
		sandbox
			.stub(authoritativeManager, "readDocument")
			.resolves({ ...activeDocument, createTime: 200 });

		await manager.purgeStaticCache(tenantId, documentId, activeDocument.createTime);

		assert.strictEqual(
			await manager.readStaticPropertiesForSummary(tenantId, documentId),
			undefined,
		);
		assert.deepStrictEqual(await cache.get(deletedKey), { createTime: 200 });
	});
});
