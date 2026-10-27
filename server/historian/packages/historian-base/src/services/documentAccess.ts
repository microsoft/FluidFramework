/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IDocumentManager,
	IStorageNameRetriever,
	ITenantManager,
} from "@fluidframework/server-services-core";

import type { ICache, ISimplifiedCustomDataRetriever } from "./definitions";

export type DocumentAccessOperation = "read" | "write" | "delete" | "create";

export interface ITrustedCreateContext {
	tenantId: string;
	documentId: string;
	storageAccountName?: string;
	physicalContainerName?: string;
	layoutVersion?: "v1" | "v2";
	lifecycleVersion: string;
	expiresAtMs: number;
}

export interface IDocumentAccessProof {
	tenantId: string;
	documentId: string;
	operation: DocumentAccessOperation;
	source:
		| "ec-lifecycle-redis"
		| "dc-v2-metadata"
		| "dc-v1-metadata"
		| "alfred-fallback"
		| "trusted-create";
	storageAccountName?: string;
	physicalContainerName?: string;
	layoutVersion?: "v1" | "v2";
	lifecycleVersion: string;
	state: "active" | "pending";
}

export interface IAuthorizeDocumentAccessInput {
	tenantId: string;
	documentId: string;
	operation: DocumentAccessOperation;
	containerTypeHint?: "ephemeral" | "durable";
	trustedCreateContext?: ITrustedCreateContext;
	existingProof?: IDocumentAccessProof;
}

export interface IDocumentAccessAuthorizer {
	authorize(input: IAuthorizeDocumentAccessInput): Promise<IDocumentAccessProof>;
}

export interface ITrustedCreateContextResolver {
	resolve(input: {
		tenantId: string;
		documentId: string;
		opaqueToken: string;
		containerTypeHint?: "ephemeral" | "durable";
	}): Promise<ITrustedCreateContext>;
}

export interface IDocumentAccessControl {
	authorizer: IDocumentAccessAuthorizer;
	trustedCreateContextResolver?: ITrustedCreateContextResolver;
}

export interface IDocumentAccessControlFactory {
	create(dependencies: {
		documentManager: IDocumentManager;
		tenantManager: ITenantManager;
		storageNameRetriever?: IStorageNameRetriever;
		gitCache?: ICache;
		simplifiedCustomDataRetriever: ISimplifiedCustomDataRetriever;
	}): IDocumentAccessControl;
}

export function getReusableDocumentAccessProof(
	proof: IDocumentAccessProof | undefined,
	expected: {
		tenantId: string;
		documentId: string;
		operation: DocumentAccessOperation;
		lifecycleVersion?: string;
	},
): IDocumentAccessProof | undefined {
	if (
		proof?.state !== "active" ||
		proof.tenantId !== expected.tenantId ||
		proof.documentId !== expected.documentId ||
		proof.operation !== expected.operation ||
		(expected.lifecycleVersion !== undefined &&
			proof.lifecycleVersion !== expected.lifecycleVersion)
	) {
		return undefined;
	}

	return proof;
}
