/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type { IDocument, ITenantManager } from "@fluidframework/server-services-core";
import * as sinon from "sinon";

import { DocumentManager } from "../services/documentManager";
import { TestCache } from "./utils";

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
		const cache = new TestCache();
		await cache.set("staticData:tenant%2Fa:shared%3Aid", {
			version: activeDocument.version,
			createTime: activeDocument.createTime,
			documentId,
			tenantId,
			storageName: activeDocument.storageName,
			isEphemeralContainer: activeDocument.isEphemeralContainer,
		});
		const manager = new DocumentManager("http://unused", {} as ITenantManager, cache);
		const readDocument = sandbox.spy(manager, "readDocument");

		const result = await manager.readStaticProperties(tenantId, documentId);

		assert.strictEqual(result?.tenantId, tenantId);
		assert.strictEqual(result?.documentId, documentId);
		sinon.assert.notCalled(readDocument);
	});

	it("forwards the customer token on an authoritative cache miss", async () => {
		const manager = new DocumentManager("http://unused", {} as ITenantManager, new TestCache());
		const readDocument = sandbox.stub(manager, "readDocument").resolves(activeDocument);

		await manager.readStaticProperties(tenantId, documentId, {
			accessToken: "customer.jwt",
		});

		sinon.assert.calledOnceWithExactly(readDocument, tenantId, documentId, {
			accessToken: "customer.jwt",
		});
	});

	it("falls back to Alfred for malformed cached static properties", async () => {
		const cache = new TestCache();
		await cache.set("staticData:tenant%2Fa:shared%3Aid", "{invalid");
		const manager = new DocumentManager("http://unused", {} as ITenantManager, cache);
		const readDocument = sandbox.stub(manager, "readDocument").resolves(activeDocument);

		const result = await manager.readStaticProperties(tenantId, documentId);

		assert.strictEqual(result?.tenantId, tenantId);
		assert.strictEqual(result?.documentId, documentId);
		sinon.assert.calledOnce(readDocument);
	});

	it("does not cache or return soft-deleted document properties", async () => {
		const cache = new TestCache();
		const cacheSet = sandbox.spy(cache, "set");
		const manager = new DocumentManager("http://unused", {} as ITenantManager, cache);
		sandbox.stub(manager, "readDocument").resolves({
			...activeDocument,
			scheduledDeletionTime: "2026-09-29T00:00:00.000Z",
		});

		assert.strictEqual(await manager.readStaticProperties(tenantId, documentId), undefined);
		sinon.assert.notCalled(cacheSet);
	});

	it("denies a cached positive entry after deletion is marked", async () => {
		const cache = new TestCache();
		await cache.set("staticData:tenant%2Fa:shared%3Aid", activeDocument);
		const manager = new DocumentManager("http://unused", {} as ITenantManager, cache);
		const readDocument = sandbox.spy(manager, "readDocument");

		await manager.purgeStaticCache(tenantId, documentId);

		assert.strictEqual(await manager.readStaticProperties(tenantId, documentId), undefined);
		sinon.assert.notCalled(readDocument);
	});
});
