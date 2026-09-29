/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type { IDocumentManager } from "@fluidframework/server-services-core";
import * as Sinon from "sinon";

import {
	type IDocumentDeleteService,
	DocumentDeleteServiceWithCacheInvalidation,
} from "../../alfred/services/documentDeleteService";

describe("DocumentDeleteServiceWithCacheInvalidation", () => {
	it("purges static ownership data before deleting document metadata", async () => {
		const calls: string[] = [];
		const documentManager = {
			purgeStaticCache: async (tenantId: string, documentId: string) => {
				assert.strictEqual(tenantId, "tenant-a");
				assert.strictEqual(documentId, "document-a");
				calls.push("purge");
			},
		} as IDocumentManager;
		const documentDeleteService: IDocumentDeleteService = {
			deleteDocument: async (tenantId: string, documentId: string) => {
				assert.strictEqual(tenantId, "tenant-a");
				assert.strictEqual(documentId, "document-a");
				calls.push("delete");
			},
		};
		const service = new DocumentDeleteServiceWithCacheInvalidation(
			documentDeleteService,
			documentManager,
		);

		await service.deleteDocument("tenant-a", "document-a");

		assert.deepStrictEqual(calls, ["purge", "delete"]);
	});

	it("does not delete document metadata when cache invalidation fails", async () => {
		const documentManager = {
			purgeStaticCache: Sinon.stub().rejects(new Error("redis unavailable")),
		} as unknown as IDocumentManager;
		const documentDeleteService: IDocumentDeleteService = {
			deleteDocument: Sinon.stub().resolves(),
		};
		const service = new DocumentDeleteServiceWithCacheInvalidation(
			documentDeleteService,
			documentManager,
		);

		await assert.rejects(service.deleteDocument("tenant-a", "document-a"), /redis unavailable/);
		Sinon.assert.notCalled(documentDeleteService.deleteDocument as Sinon.SinonStub);
	});
});
