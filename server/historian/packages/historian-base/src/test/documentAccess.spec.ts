/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as nconf from "nconf";

import {
	getReusableDocumentAccessProof,
	type IDocumentAccessProof,
} from "../services/documentAccess";
import type { ICreateGitServiceArgs, ISummaryAccessContext } from "../services/definitions";
import { TestDocumentManager, TestTenantService } from "./utils";

type ActiveDocumentAccessProof = Extract<
	IDocumentAccessProof,
	{ state: "active"; containerType: "durable" }
>;

function createProof(
	overrides: Partial<ActiveDocumentAccessProof> = {},
): ActiveDocumentAccessProof {
	return {
		tenantId: "tenant",
		documentId: "document",
		operation: "read",
		source: "dc-v2-metadata",
		containerType: "durable",
		storageAccountName: "storage",
		physicalContainerName: "pd2-document",
		layoutVersion: "v2",
		lifecycleVersion: "generation-1",
		state: "active",
		...overrides,
	};
}

describe("document access contract", () => {
	it("expresses operation-state and storage-routing invariants in the type", () => {
		// @ts-expect-error Create proofs must remain pending until activation succeeds.
		const activeCreateProof: IDocumentAccessProof = {
			tenantId: "tenant",
			documentId: "document",
			operation: "create",
			source: "trusted-create",
			containerType: "durable",
			lifecycleVersion: "generation-1",
			state: "active",
		};
		// @ts-expect-error Physical container routing requires its storage account and layout.
		const incompleteStorageProof: IDocumentAccessProof = {
			tenantId: "tenant",
			documentId: "document",
			operation: "read",
			source: "dc-v2-metadata",
			containerType: "durable",
			physicalContainerName: "pd2-document",
			lifecycleVersion: "generation-1",
			state: "active",
		};

		assert.ok(activeCreateProof);
		assert.ok(incompleteStorageProof);
	});

	it("preserves the legacy create-service and summary-context contract", () => {
		const summaryAccessContext: ISummaryAccessContext = {
			tenantId: "tenant",
			documentId: "document",
			isEphemeralContainer: false,
			createTime: 1,
			storageName: "storage",
			source: "alfred",
		};
		const createArgs: ICreateGitServiceArgs = {
			config: new nconf.Provider({}),
			tenantId: "tenant",
			authorization: undefined,
			tenantService: new TestTenantService(),
			documentManager: new TestDocumentManager(),
			summaryAccessContext,
		};

		assert.strictEqual(createArgs.summaryAccessContext, summaryAccessContext);
	});

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
			name: "pending state",
			proof: {
				tenantId: "tenant",
				documentId: "document",
				operation: "create",
				source: "trusted-create",
				containerType: "durable",
				lifecycleVersion: "generation-1",
				state: "pending",
			} satisfies IDocumentAccessProof,
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
