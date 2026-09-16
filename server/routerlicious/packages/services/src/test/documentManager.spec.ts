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
		server = createServer((_request, response) => {
			response.writeHead(200, { "Content-Type": "application/json" });
			response.end(JSON.stringify(document));
		});
		const activeServer = server;
		await new Promise<void>((resolve) => activeServer.listen(0, "127.0.0.1", resolve));
		const address = activeServer.address() as AddressInfo;
		const tenantManager = sandbox.createStubInstance(TenantManager);
		tenantManager.signToken.resolves(
			generateToken("tenant-a", "shared-id", "test-key", [ScopeType.DocRead]),
		);
		const cache = new RecordingCache();
		const manager = new DocumentManager(
			`http://127.0.0.1:${address.port}`,
			tenantManager,
			cache,
		);

		assert.deepStrictEqual(await manager.readDocument("tenant-a", "shared-id"), document);
		assert.deepStrictEqual(cache.sets, []);
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

	it("never stores scheduledDeletionTime in static properties", async () => {
		const cache = new RecordingCache();
		const tenantManager = sandbox.createStubInstance(TenantManager);
		const manager = new DocumentManager("http://unused", tenantManager, cache);
		sandbox.stub(manager, "readDocument").resolves({
			...createDocument("tenant-a", "document-a"),
			scheduledDeletionTime: "2026-07-31T18:00:00.000Z",
		});

		const properties = await manager.readStaticProperties("tenant-a", "document-a");

		assert.strictEqual(
			Object.prototype.hasOwnProperty.call(properties, "scheduledDeletionTime"),
			false,
		);
	});

	it("purges only the requested tenant-qualified key", async () => {
		const cache = new RecordingCache();
		cache.values.set("staticData:tenant%3Aa:shared%3Aid", "{}");
		cache.values.set("staticData:tenant%3Ab:shared%3Aid", "{}");
		const tenantManager = sandbox.createStubInstance(TenantManager);
		const manager = new DocumentManager("http://unused", tenantManager, cache);

		await manager.purgeStaticCache("tenant:a", "shared:id");

		assert.deepStrictEqual(cache.deletes, ["staticData:tenant%3Aa:shared%3Aid"]);
		assert.strictEqual(cache.values.has("staticData:tenant%3Ab:shared%3Aid"), true);
	});
});
