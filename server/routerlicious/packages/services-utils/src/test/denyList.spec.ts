/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { DenyList } from "../denyList";

describe("denyList", () => {
	describe("shouldDenyIfTenantInList", () => {
		it("singleTenantInListButNoDocuments", () => {
			const deniedTenants = ["tenantId1"];
			const denyList = new DenyList(deniedTenants);
			const result = denyList.isDocumentDenied("documentId1");
			const expected = false;
			assert.strictEqual(result, expected);
			const result2 = denyList.isTenantDenied("tenantId1");
			const expected2 = true;
			assert.strictEqual(result2, expected2);
		});
		it("singleTenantInListButNoDocuments", () => {
			const deniedTenants = ["tenantId1"];
			const deniedDocuments = ["documentId1", "documentId2"];
			const denyList = new DenyList(deniedTenants, deniedDocuments);
			const result = denyList.isDocumentDenied("documentId1");
			const expected = true;
			assert.strictEqual(result, expected);
			const result2 = denyList.isTenantDenied("tenantId2");
			const expected2 = false;
			assert.strictEqual(result2, expected2);
		});
		it("multipleTenantsInList", () => {
			const deniedTenants = ["tenantId1", "tenantId2"];
			const deniedDocuments = ["documentId1", "documentId2"];
			const denyList = new DenyList(deniedTenants, deniedDocuments);
			const result1 = denyList.isTenantDenied("tenantId1");
			const expected1 = true;
			assert.strictEqual(result1, expected1);

			const result2 = denyList.isTenantDenied("tenantId2");
			const expected2 = true;
			assert.strictEqual(result2, expected2);
		});
	});
	describe("shouldDenyIfDocumentIsInList", () => {
		it("singleDocumentInList", () => {
			const deniedDocuments = ["documentId1"];
			const denyList = new DenyList(undefined, deniedDocuments);
			const result = denyList.isDocumentDenied("documentId1");
			const expected = true;
			assert.strictEqual(result, expected);
			const result2 = denyList.isTenantDenied("tenantId1");
			const expected2 = false;
			assert.strictEqual(result2, expected2);
		});
		it("multipleDocumentsInList", () => {
			const deniedDocuments = ["documentId1", "documentId2"];
			const denyList = new DenyList(undefined, deniedDocuments);
			const result1 = denyList.isDocumentDenied("documentId1");
			const expected1 = true;
			assert.strictEqual(result1, expected1);
			const result2 = denyList.isDocumentDenied("documentId2");
			const expected2 = true;
			assert.strictEqual(result2, expected2);
			const result3 = denyList.isTenantDenied("tenantId1");
			const expected3 = false;
			assert.strictEqual(result3, expected3);
		});
		it("multipleDocumentsInList", () => {
			const deniedDocuments = ["documentId1", "documentId2", "documentId3", "documentId4"];
			const denyList = new DenyList(undefined, deniedDocuments);

			const result1 = denyList.isDocumentDenied("documentId1");
			const expected1 = true;
			assert.strictEqual(result1, expected1);

			const result2 = denyList.isDocumentDenied("documentId3");
			const expected2 = true;
			assert.strictEqual(result2, expected2);
			const result3 = denyList.isTenantDenied("tenantId1");
			const expected3 = false;
			assert.strictEqual(result3, expected3);
		});
	});
	describe("shouldNotDenyIfDocumentNotInList", () => {
		it("undefinedList", () => {
			const denyList = new DenyList();
			const result = denyList.isDocumentDenied("documentId1");
			const expected = false;
			assert.strictEqual(result, expected);
			const result3 = denyList.isTenantDenied("tenantId1");
			const expected3 = false;
			assert.strictEqual(result3, expected3);
		});
		it("emptyList", () => {
			const deniedDocuments = [];
			const denyList = new DenyList(undefined, deniedDocuments);
			const result = denyList.isDocumentDenied("documentId1");
			const expected = false;
			assert.strictEqual(result, expected);
			const result3 = denyList.isTenantDenied("tenantId1");
			const expected3 = false;
			assert.strictEqual(result3, expected3);
		});
	});
});
