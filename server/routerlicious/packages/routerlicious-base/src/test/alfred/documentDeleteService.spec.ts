/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type { IDocumentRepository } from "@fluidframework/server-services-core";
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
		const documentDeleteService: IDocumentDeleteService = {
			deleteDocument: Sinon.stub().resolves(),
		};
		const service = new DocumentDeleteServiceWithCacheInvalidation(
			documentDeleteService,
			documentManager,
			documentRepository,
		);

		await assert.rejects(service.deleteDocument("tenant-a", "document-a"), /redis unavailable/);
		Sinon.assert.notCalled(documentDeleteService.deleteDocument as Sinon.SinonStub);
	});

	it("does not write a marker when deletion is not implemented", async () => {
		const documentManager = {
			purgeStaticCache: Sinon.stub().resolves(),
		} as unknown as IDocumentStaticCacheInvalidator;
		const documentDeleteService = new DocumentDeleteService();
		const documentRepository = {
			readOne: Sinon.stub().resolves({ createTime: 100 }),
		} as unknown as IDocumentRepository;
		const service = new DocumentDeleteServiceWithCacheInvalidation(
			documentDeleteService,
			documentManager,
			documentRepository,
		);

		await assert.rejects(service.deleteDocument("tenant-a", "document-a"), /not implemented/);
		Sinon.assert.notCalled(documentRepository.readOne as Sinon.SinonStub);
		Sinon.assert.notCalled(documentManager.purgeStaticCache as Sinon.SinonStub);
	});

	it("retains the marker when deletion failure may be partial", async () => {
		const documentManager = {
			purgeStaticCache: Sinon.stub().resolves(),
		} as unknown as IDocumentStaticCacheInvalidator;
		const documentDeleteService: IDocumentDeleteService = {
			deleteDocument: Sinon.stub().rejects(new Error("storage failure")),
		};
		const documentRepository = {
			readOne: Sinon.stub().resolves({ createTime: 100 }),
		} as unknown as IDocumentRepository;
		const service = new DocumentDeleteServiceWithCacheInvalidation(
			documentDeleteService,
			documentManager,
			documentRepository,
		);

		await assert.rejects(service.deleteDocument("tenant-a", "document-a"), /storage failure/);
		Sinon.assert.calledOnce(documentManager.purgeStaticCache as Sinon.SinonStub);
	});
});
