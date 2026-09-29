/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type { ICache, IDocumentRepository } from "@fluidframework/server-services-core";
import * as Sinon from "sinon";

import {
	DocumentDeleteService,
	type IDocumentDeleteService,
	type IDocumentStaticCacheInvalidator,
	DocumentDeleteServiceWithCacheInvalidation,
} from "../../alfred/services/documentDeleteService";

describe("DocumentDeleteServiceWithCacheInvalidation", () => {
	it("purges static ownership data before deleting document metadata", async () => {
		const calls: string[] = [];
		const documentManager = {
			purgeStaticCache: async (tenantId: string, documentId: string, createTime?: number) => {
				assert.strictEqual(tenantId, "tenant-a");
				assert.strictEqual(documentId, "document-a");
				assert.strictEqual(createTime, 100);
				calls.push("purge");
			},
		} as unknown as IDocumentStaticCacheInvalidator;
		const documentRepository = {
			readOne: Sinon.stub().resolves({ createTime: 100 }),
		} as unknown as IDocumentRepository;
		const documentDeletionMarkerCache = {
			delete: Sinon.stub().resolves(true),
		} as unknown as ICache;
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
			documentRepository,
			documentDeletionMarkerCache,
		);

		await service.deleteDocument("tenant-a", "document-a");

		assert.deepStrictEqual(calls, ["purge", "delete"]);
	});

	it("does not delete document metadata when cache invalidation fails", async () => {
		const documentManager = {
			purgeStaticCache: Sinon.stub().rejects(new Error("redis unavailable")),
		} as unknown as IDocumentStaticCacheInvalidator;
		const documentRepository = {
			readOne: Sinon.stub().resolves({ createTime: 100 }),
		} as unknown as IDocumentRepository;
		const documentDeletionMarkerCache = {
			delete: Sinon.stub().resolves(true),
		} as unknown as ICache;
		const documentDeleteService: IDocumentDeleteService = {
			deleteDocument: Sinon.stub().resolves(),
		};
		const service = new DocumentDeleteServiceWithCacheInvalidation(
			documentDeleteService,
			documentManager,
			documentRepository,
			documentDeletionMarkerCache,
		);

		await assert.rejects(service.deleteDocument("tenant-a", "document-a"), /redis unavailable/);
		Sinon.assert.notCalled(documentDeleteService.deleteDocument as Sinon.SinonStub);
	});

	it("clears the marker when deletion definitely failed before mutation", async () => {
		const deleteMarker = Sinon.stub().resolves(true);
		const documentManager = {
			purgeStaticCache: Sinon.stub().resolves(),
		} as unknown as IDocumentStaticCacheInvalidator;
		const documentDeleteService = new DocumentDeleteService();
		const documentRepository = {
			readOne: Sinon.stub().resolves({ createTime: 100 }),
		} as unknown as IDocumentRepository;
		const documentDeletionMarkerCache = { delete: deleteMarker } as unknown as ICache;
		const service = new DocumentDeleteServiceWithCacheInvalidation(
			documentDeleteService,
			documentManager,
			documentRepository,
			documentDeletionMarkerCache,
		);

		await assert.rejects(service.deleteDocument("tenant-a", "document-a"), /not implemented/);
		Sinon.assert.calledOnceWithExactly(deleteMarker, "deletedDocument:tenant-a:document-a");
	});

	it("retains the marker when deletion failure may be partial", async () => {
		const deleteMarker = Sinon.stub().resolves(true);
		const documentManager = {
			purgeStaticCache: Sinon.stub().resolves(),
		} as unknown as IDocumentStaticCacheInvalidator;
		const documentDeleteService: IDocumentDeleteService = {
			deleteDocument: Sinon.stub().rejects(new Error("storage failure")),
		};
		const documentRepository = {
			readOne: Sinon.stub().resolves({ createTime: 100 }),
		} as unknown as IDocumentRepository;
		const documentDeletionMarkerCache = { delete: deleteMarker } as unknown as ICache;
		const service = new DocumentDeleteServiceWithCacheInvalidation(
			documentDeleteService,
			documentManager,
			documentRepository,
			documentDeletionMarkerCache,
		);

		await assert.rejects(service.deleteDocument("tenant-a", "document-a"), /storage failure/);
		Sinon.assert.notCalled(deleteMarker);
	});
});
