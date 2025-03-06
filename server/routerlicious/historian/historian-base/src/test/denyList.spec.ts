/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { DenyList } from "../services";

describe("denyList", () => {
	describe("shouldDenyIfDocumentIsInList", () => {
		it("singleDocumentInList", () => {
			const deniedDocuments = {
				tenantId1: ["documentId1"],
			};
			const denyList = new DenyList(deniedDocuments);
			const result = denyList.isDenied("tenantId1", "documentId1");
			const expected = true;
			assert.strictEqual(result, expected);
		});
		it("multipleDocumentsInList", () => {
			const deniedDocuments = {
				tenantId1: ["documentId1", "documentId2"],
			};
			const denyList = new DenyList(deniedDocuments);
			const result1 = denyList.isDenied("tenantId1", "documentId1");
			const expected1 = true;
			assert.strictEqual(result1, expected1);
			const result2 = denyList.isDenied("tenantId1", "documentId2");
			const expected2 = true;
			assert.strictEqual(result2, expected2);
		});
		it("multipleDocumentsInList", () => {
			const deniedDocuments = {
				tenantId1: ["documentId1", "documentId2"],
				tenantId2: ["documentId3", "documentId4"],
			};
			const denyList = new DenyList(deniedDocuments);

			const result1 = denyList.isDenied("tenantId1", "documentId1");
			const expected1 = true;
			assert.strictEqual(result1, expected1);

			const result2 = denyList.isDenied("tenantId2", "documentId3");
			const expected2 = true;
			assert.strictEqual(result2, expected2);
		});
	});
	describe("shouldNotDenyIfDocumentNotInList", () => {
		it("undefinedMap", () => {
			const denyList = new DenyList();
			const result = denyList.isDenied("tenantId1", "documentId1");
			const expected = false;
			assert.strictEqual(result, expected);
		});
		it("emptyMap", () => {
			const deniedDocuments = {};
			const denyList = new DenyList(deniedDocuments);
			const result = denyList.isDenied("tenantId1", "documentId1");
			const expected = false;
			assert.strictEqual(result, expected);
		});
		it("emptyListForTenant", () => {
			const deniedDocuments = {
				tenantId1: [],
			};
			const denyList = new DenyList(deniedDocuments);
			const result1 = denyList.isDenied("tenantId1", "documentId1");
			const expected1 = false;
			assert.strictEqual(result1, expected1);
		});
		it("documentNotInTenantList", () => {
			const deniedDocuments = {
				tenantId1: ["documentId1", "documentId2"],
				tenantId2: ["documentId3", "documentId4"],
			};
			const denyList = new DenyList(deniedDocuments);

			const result1 = denyList.isDenied("tenantId1", "documentId3");
			const expected1 = false;
			assert.strictEqual(result1, expected1);

			const result2 = denyList.isDenied("tenantId2", "documentId2");
			const expected2 = false;
			assert.strictEqual(result2, expected2);
		});
	});
});
