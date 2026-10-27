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

type IDocumentStorageRouting =
	| {
			/**
			 * A storage account may be selected without overriding the physical container for
			 * legacy layouts.
			 */
			storageAccountName?: string;
			physicalContainerName?: undefined;
			layoutVersion?: undefined;
	  }
	| {
			/**
			 * Physical container routing is atomic: the storage account, container, and layout
			 * must be supplied together.
			 */
			storageAccountName: string;
			physicalContainerName: string;
			layoutVersion: "v1" | "v2";
	  };

interface ITrustedCreateContextBase {
	tenantId: string;
	documentId: string;
	/**
	 * Identifies the document generation authorized for creation.
	 */
	lifecycleVersion: string;
	expiresAtMs: number;
}

/**
 * Trusted context for one initial summary upload.
 *
 * When a physical container is specified, its storage account and layout must also be present.
 */
export type ITrustedCreateContext = ITrustedCreateContextBase & IDocumentStorageRouting;

interface IDocumentAccessProofBase {
	tenantId: string;
	documentId: string;
	source:
		| "ec-lifecycle-redis"
		| "dc-v2-metadata"
		| "dc-v1-metadata"
		| "alfred-fallback"
		| "trusted-create";
	/**
	 * Identifies the authorized document generation. It must be non-empty and must match a
	 * trusted creation context when one is supplied.
	 */
	lifecycleVersion: string;
}

type IDocumentAccessState =
	| {
			/**
			 * Creation is authorized only while its durable lifecycle is pending.
			 */
			operation: "create";
			state: "pending";
	  }
	| {
			/**
			 * Existing-document operations require an active lifecycle.
			 */
			operation: Exclude<DocumentAccessOperation, "create">;
			state: "active";
	  };

/**
 * Request-scoped authorization proof returned by an {@link IDocumentAccessAuthorizer}.
 *
 * The tenant, document, operation, lifecycle generation, and state must match the request.
 * Physical container routing is atomic: when a physical container is present, the storage
 * account and layout are required with it. A storage account without a physical container is
 * allowed for legacy storage selection.
 */
export type IDocumentAccessProof = IDocumentAccessProofBase &
	IDocumentAccessState &
	IDocumentStorageRouting;

export interface IAuthorizeDocumentAccessInput {
	tenantId: string;
	documentId: string;
	operation: DocumentAccessOperation;
	containerTypeHint?: "ephemeral" | "durable";
	trustedCreateContext?: ITrustedCreateContext;
	/**
	 * A proof previously returned by this authorization boundary during the current request.
	 */
	existingProof?: IDocumentAccessProof;
}

export interface IDocumentAccessAuthorizer {
	/**
	 * Authorizes one operation and returns the complete lifecycle and physical storage proof that
	 * Historian must use for the request.
	 */
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
