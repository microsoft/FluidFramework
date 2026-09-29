/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";

import { ScopeType } from "@fluidframework/protocol-definitions";
import { generateToken } from "@fluidframework/server-services-client";
import type { ICache, IDocument } from "@fluidframework/server-services-core";
import * as sinon from "sinon";

import { DocumentManager } from "../documentManager";
import { TenantManager } from "../tenant";

class RecordingCache implements ICache {
	public readonly values = new Map<string, string>();
	public readonly gets: string[] = [];
	public readonly sets: string[] = [];
	public readonly deletes: string[] = [];

	// eslint-disable-next-line @rushstack/no-new-null
	public async get(key: string): Promise<string | null> {
		this.gets.push(key);
		return this.values.get(key) ?? null;
	}

	public async set(key: string, value: string): Promise<void> {
		this.sets.push(key);
		this.values.set(key, value);
	}

	public async delete(key: string): Promise<boolean> {
		this.deletes.push(key);
		return this.values.delete(key);
	}
}

const createDocument = (tenantId: string, documentId: string): IDocument => ({
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
	storageName: `storage-${tenantId}`,
	isEphemeralContainer: false,
});

describe("DocumentManager", () => {
	const sandbox = sinon.createSandbox();
	let server: Server | undefined;

	afterEach(async () => {
		sandbox.restore();
		if (server?.listening) {
			const activeServer = server;
			await new Promise<void>((resolve, reject) =>
				activeServer.close((error) => (error ? reject(error) : resolve())),
			);
		}
	});

	it("does not write static cache during readDocument", async () => {
		const document = createDocument("tenant-a", "shared-id");
		let authorizationHeader: string | undefined;
		server = createServer((request, response) => {
			authorizationHeader = request.headers.authorization;
			response.writeHead(200, { "Content-Type": "application/json" });
			response.end(JSON.stringify(document));
		});
		const activeServer = server;
		await new Promise<void>((resolve) => activeServer.listen(0, "127.0.0.1", resolve));
		const address = activeServer.address() as AddressInfo;
		const tenantManager = sandbox.createStubInstance(TenantManager);
		const accessToken = generateToken("tenant-a", "shared-id", "test-key", [ScopeType.DocRead]);
		tenantManager.signToken.resolves(accessToken);
		const cache = new RecordingCache();
		const manager = new DocumentManager(
			`http://127.0.0.1:${address.port}`,
			tenantManager,
			cache,
		);

		assert.deepStrictEqual(await manager.readDocument("tenant-a", "shared-id"), document);
		assert.strictEqual(authorizationHeader, `Basic ${accessToken}`);
		sinon.assert.calledOnce(tenantManager.signToken);
		assert.deepStrictEqual(cache.sets, []);
	});

	it("uses a provided access token without minting an internal token", async () => {
		const document = createDocument("tenant-a", "shared-id");
		const accessToken = "customer.jwt";
		let authorizationHeader: string | undefined;
		server = createServer((request, response) => {
			authorizationHeader = request.headers.authorization;
			response.writeHead(200, { "Content-Type": "application/json" });
			response.end(JSON.stringify(document));
		});
		const activeServer = server;
		await new Promise<void>((resolve) => activeServer.listen(0, "127.0.0.1", resolve));
		const address = activeServer.address() as AddressInfo;
		const tenantManager = sandbox.createStubInstance(TenantManager);
		const manager = new DocumentManager(`http://127.0.0.1:${address.port}`, tenantManager);

		assert.deepStrictEqual(
			await manager.readDocument("tenant-a", "shared-id", { accessToken }),
			document,
		);
		assert.strictEqual(authorizationHeader, `Basic ${accessToken}`);
		sinon.assert.notCalled(tenantManager.signToken);
	});

	for (const statusCode of [401, 403, 503]) {
		it(`does not fall back to an internal token after an Alfred ${statusCode}`, async () => {
			const accessToken = "customer.jwt";
			const authorizationHeaders: (string | undefined)[] = [];
			server = createServer((request, response) => {
				authorizationHeaders.push(request.headers.authorization);
				response.writeHead(statusCode, { "Content-Type": "application/json" });
				response.end(JSON.stringify({ message: "rejected" }));
			});
			const activeServer = server;
			await new Promise<void>((resolve) => activeServer.listen(0, "127.0.0.1", resolve));
			const address = activeServer.address() as AddressInfo;
			const tenantManager = sandbox.createStubInstance(TenantManager);
			tenantManager.signToken.resolves("internal.jwt");
			const manager = new DocumentManager(`http://127.0.0.1:${address.port}`, tenantManager);

			await assert.rejects(manager.readDocument("tenant-a", "shared-id", { accessToken }));
			assert.deepStrictEqual(authorizationHeaders, [`Basic ${accessToken}`]);
			sinon.assert.notCalled(tenantManager.signToken);
		});
	}

	it("preserves internal token refresh when no access token is provided", async () => {
		const document = createDocument("tenant-a", "shared-id");
		const expiredToken = generateToken(
			"tenant-a",
			"shared-id",
			"test-key",
			[ScopeType.DocRead],
			undefined,
			-60,
		);
		const refreshedToken = generateToken("tenant-a", "shared-id", "test-key", [
			ScopeType.DocRead,
		]);
		let authorizationHeader: string | undefined;
		server = createServer((request, response) => {
			authorizationHeader = request.headers.authorization;
			response.writeHead(200, { "Content-Type": "application/json" });
			response.end(JSON.stringify(document));
		});
		const activeServer = server;
		await new Promise<void>((resolve) => activeServer.listen(0, "127.0.0.1", resolve));
		const address = activeServer.address() as AddressInfo;
		const tenantManager = sandbox.createStubInstance(TenantManager);
		tenantManager.signToken.onFirstCall().resolves(expiredToken);
		tenantManager.signToken.onSecondCall().resolves(refreshedToken);
		const manager = new DocumentManager(`http://127.0.0.1:${address.port}`, tenantManager);

		assert.deepStrictEqual(await manager.readDocument("tenant-a", "shared-id"), document);
		assert.strictEqual(authorizationHeader, `Basic ${refreshedToken}`);
		sinon.assert.calledTwice(tenantManager.signToken);
	});

	it("uses distinct static entries for duplicate document IDs across tenants", async () => {
		const cache = new RecordingCache();
		cache.values.set(
			"staticData:shared:id",
			JSON.stringify(createDocument("victim-tenant", "shared:id")),
		);
		const tenantManager = sandbox.createStubInstance(TenantManager);
		const manager = new DocumentManager("http://unused", tenantManager, cache);
		const readDocument = sandbox.stub(manager, "readDocument");
		readDocument
			.withArgs("tenant:a", "shared:id")
			.resolves(createDocument("tenant:a", "shared:id"));
		readDocument
			.withArgs("tenant:b", "shared:id")
			.resolves(createDocument("tenant:b", "shared:id"));

		await manager.readStaticProperties("tenant:a", "shared:id");
		await manager.readStaticProperties("tenant:b", "shared:id");

		assert.deepStrictEqual(cache.sets, [
			"staticData:tenant%3Aa:shared%3Aid",
			"staticData:tenant%3Ab:shared%3Aid",
		]);
		assert.strictEqual(cache.gets.includes("staticData:shared:id"), false);
	});

	it("does not cache a mismatched Alfred document", async () => {
		const cache = new RecordingCache();
		const tenantManager = sandbox.createStubInstance(TenantManager);
		const manager = new DocumentManager("http://unused", tenantManager, cache);
		sandbox
			.stub(manager, "readDocument")
			.resolves(createDocument("victim-tenant", "shared-id"));

		assert.strictEqual(
			await manager.readStaticProperties("attacker-tenant", "shared-id"),
			undefined,
		);
		assert.deepStrictEqual(cache.sets, []);
	});

	it("forwards a provided access token when a static cache miss falls back to Alfred", async () => {
		const cache = new RecordingCache();
		const tenantManager = sandbox.createStubInstance(TenantManager);
		const manager = new DocumentManager("http://unused", tenantManager, cache);
		const readDocument = sandbox
			.stub(manager, "readDocument")
			.resolves(createDocument("tenant-a", "document-a"));

		await manager.readStaticProperties("tenant-a", "document-a", {
			accessToken: "customer.jwt",
		});

		sinon.assert.calledOnceWithExactly(readDocument, "tenant-a", "document-a", {
			accessToken: "customer.jwt",
		});
	});

	it("falls back to Alfred and replaces malformed cached static properties", async () => {
		const cache = new RecordingCache();
		cache.values.set("staticData:tenant-a:document-a", "{invalid");
		const tenantManager = sandbox.createStubInstance(TenantManager);
		const manager = new DocumentManager("http://unused", tenantManager, cache);
		const document = createDocument("tenant-a", "document-a");
		const readDocument = sandbox.stub(manager, "readDocument").resolves(document);
		const { version, createTime, documentId, tenantId, storageName, isEphemeralContainer } =
			document;

		assert.deepStrictEqual(await manager.readStaticProperties("tenant-a", "document-a"), {
			version,
			createTime,
			documentId,
			tenantId,
			storageName,
			isEphemeralContainer,
		});
		sinon.assert.calledOnceWithExactly(readDocument, "tenant-a", "document-a", undefined);
		assert.deepStrictEqual(cache.deletes, ["staticData:tenant-a:document-a"]);
		assert.deepStrictEqual(cache.sets, ["staticData:tenant-a:document-a"]);
	});

	it("falls back to Alfred when cached static properties cannot be decoded", async () => {
		const cache = new RecordingCache();
		const cacheGet = sandbox.stub(cache, "get").callsFake(async (key: string) => {
			if (key.startsWith("staticData:")) {
				throw new SyntaxError("invalid JSON");
			}
			return null;
		});
		const tenantManager = sandbox.createStubInstance(TenantManager);
		const manager = new DocumentManager("http://unused", tenantManager, cache);
		const document = createDocument("tenant-a", "document-a");
		const readDocument = sandbox.stub(manager, "readDocument").resolves(document);

		const properties = await manager.readStaticProperties("tenant-a", "document-a");

		assert.strictEqual(properties?.tenantId, "tenant-a");
		assert.strictEqual(properties?.documentId, "document-a");
		sinon.assert.callCount(cacheGet, 3);
		sinon.assert.calledOnce(readDocument);
		assert.deepStrictEqual(cache.deletes, ["staticData:tenant-a:document-a"]);
	});

	it("does not return or cache static properties for a soft-deleted document", async () => {
		const cache = new RecordingCache();
		const tenantManager = sandbox.createStubInstance(TenantManager);
		const manager = new DocumentManager("http://unused", tenantManager, cache);
		sandbox.stub(manager, "readDocument").resolves({
			...createDocument("tenant-a", "document-a"),
			scheduledDeletionTime: "2026-07-31T18:00:00.000Z",
		});

		const properties = await manager.readStaticProperties("tenant-a", "document-a");

		assert.strictEqual(properties, undefined);
		assert.deepStrictEqual(cache.sets, []);
	});

	it("purges only the requested tenant-qualified key", async () => {
		const cache = new RecordingCache();
		cache.values.set("staticData:tenant%3Aa:shared%3Aid", "{}");
		cache.values.set("staticData:tenant%3Ab:shared%3Aid", "{}");
		const tenantManager = sandbox.createStubInstance(TenantManager);
		const manager = new DocumentManager("http://unused", tenantManager, cache);

		await manager.purgeStaticCache("tenant:a", "shared:id");

		assert.deepStrictEqual(cache.deletes, ["staticData:tenant%3Aa:shared%3Aid"]);
		assert.strictEqual(cache.values.get("deletedDocument:tenant%3Aa:shared%3Aid"), "true");
		assert.strictEqual(cache.values.has("staticData:tenant%3Ab:shared%3Aid"), true);
	});

	it("denies cached static properties after deletion is marked", async () => {
		const cache = new RecordingCache();
		cache.values.set(
			"staticData:tenant-a:document-a",
			JSON.stringify(createDocument("tenant-a", "document-a")),
		);
		const tenantManager = sandbox.createStubInstance(TenantManager);
		const manager = new DocumentManager("http://unused", tenantManager, cache);
		const readDocument = sandbox.spy(manager, "readDocument");

		await manager.purgeStaticCache("tenant-a", "document-a");

		assert.strictEqual(await manager.readStaticProperties("tenant-a", "document-a"), undefined);
		sinon.assert.notCalled(readDocument);
	});
});
