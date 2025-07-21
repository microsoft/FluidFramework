/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	authRequestWithRetry,
	fetchTokens,
	getFetchTokenUrl,
	getLoginPageUrl,
	getOdspRefreshTokenFn,
	getOdspScope,
	getPushRefreshTokenFn,
	getRefreshTokenFn,
	type IPublicClientConfig,
	type IOdspAuthRequestInfo,
	type IOdspTokens,
	pushScope,
	refreshTokens,
	type TokenRequestCredentials,
} from "./odspAuth.js";
export {
	getAadTenant,
	getAadUrl,
	getServer,
	getSiteUrl,
	isOdspHostname,
	isPushChannelHostname,
} from "./odspDocLibUtils.js";
export {
	getChildrenByDriveItem,
	getDriveId,
	getDriveItemByRootFileName,
	getDriveItemByServerRelativePath,
	getDriveItemFromDriveAndItem,
	type IOdspDriveItem,
} from "./odspDrives.js";
export {
	createOdspNetworkError,
	enrichOdspError,
	fetchIncorrectResponse,
	getSPOAndGraphRequestIdsFromResponse,
	hasFacetCodes,
	hasRedirectionLocation,
	type OdspErrorResponse,
	type OdspErrorResponseInnerError,
	OdspRedirectError,
	OdspServiceReadOnlyErrorCode,
	parseFacetCodes,
	throwOdspNetworkError,
	tryParseErrorResponse,
} from "./odspErrorUtils.js";
export { getAsync, postAsync, putAsync, unauthPostAsync } from "./odspRequest.js";
