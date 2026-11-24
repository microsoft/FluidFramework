/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type {
	ICache,
	IConnectionString,
	ICredentials,
	IExternalStorage,
	IOauthAccessInfo,
	IStorage,
	ITenant,
	ITenantCustomDataExternal,
	ITenantService,
	ISimplifiedCustomDataRetriever,
	IPostEphemeralContainerChecker,
	ICreateGitServiceArgs,
	ActivateSummaryAccessResult,
	IEphemeralSummaryAccessRecord,
	IEphemeralSummaryAccessStore,
	ISummaryAccessContext,
} from "./definitions";
export {
	isEphemeralSummaryAccessStore,
	MalformedEphemeralSummaryAccessRecordError,
} from "./definitions";
export type {
	DocumentAccessOperation,
	IAuthorizeDocumentAccessInput,
	IDocumentAccessAuthorizer,
	IDocumentAccessControl,
	IDocumentAccessControlFactory,
	IDocumentAccessProof,
	ITrustedCreateContext,
	ITrustedCreateContextResolver,
} from "./documentAccess";
export { getReusableDocumentAccessProof } from "./documentAccess";
export { RedisCache } from "./redisCache";
export { RedisTenantCache } from "./redisTenantCache";
export { type IDocument, RestGitService } from "./restGitService";
export { RiddlerService } from "./riddlerService";
export { SimplifiedCustomDataRetriever } from "./simplifiedCustomDataRetriever";
