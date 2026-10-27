/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	getReusableDocumentAccessProof,
	type IDocumentAccessProof,
} from "../services/documentAccess";

function createProof(overrides: Partial<IDocumentAccessProof> = {}): IDocumentAccessProof {
	return {
		tenantId: "tenant",
		documentId: "document",
		operation: "read",
		source: "dc-v2-metadata",
		storageAccountName: "storage",
		physicalContainerName: "pd2-document",
		layoutVersion: "v2",
		lifecycleVersion: "generation-1",
		state: "active",
		...overrides,
	};
}

describe("document access contract", () => {
	it("reuses an exact active proof", () => {
		const proof = createProof();

		assert.strictEqual(
			getReusableDocumentAccessProof(proof, {
				tenantId: "tenant",
				documentId: "document",
				operation: "read",
				lifecycleVersion: "generation-1",
			}),
			proof,
		);
	});

	for (const testCase of [
		{
			name: "tenant",
			proof: createProof({ tenantId: "other-tenant" }),
		},
		{
			name: "document",
			proof: createProof({ documentId: "other-document" }),
		},
		{
			name: "operation",
			proof: createProof({ operation: "write" }),
		},
		{
			name: "lifecycle version",
			proof: createProof({ lifecycleVersion: "generation-2" }),
		},
		{
			name: "active state",
			proof: createProof({ state: "pending" }),
		},
	] as const) {
		it(`does not reuse a proof with a different ${testCase.name}`, () => {
			assert.strictEqual(
				getReusableDocumentAccessProof(testCase.proof, {
					tenantId: "tenant",
					documentId: "document",
					operation: "read",
					lifecycleVersion: "generation-1",
				}),
				undefined,
			);
		});
	}
});
