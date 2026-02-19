/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type IOdspAuthRequestInfo,
	type IOdspTokens,
	type IPublicClientConfig,
	type TokenRequestCredentials,
	authRequestWithRetry,
	fetchTokens,
	getFetchTokenUrl,
	getLoginPageUrl,
	getOdspRefreshTokenFn,
	getOdspScope,
	getPushRefreshTokenFn,
	getRefreshTokenFn,
	pushScope,
	refreshTokens,
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
	type IOdspDriveItem,
	getChildrenByDriveItem,
	getDriveId,
	getDriveItemByRootFileName,
	getDriveItemByServerRelativePath,
	getDriveItemFromDriveAndItem,
} from "./odspDrives.js";
export {
	type OdspErrorResponse,
	type OdspErrorResponseInnerError,
	OdspRedirectError,
	OdspServiceReadOnlyErrorCode,
	createOdspNetworkError,
	enrichOdspError,
	fetchIncorrectResponse,
	getSPOAndGraphRequestIdsFromResponse,
	hasFacetCodes,
	hasRedirectionLocation,
	parseFacetCodes,
	throwOdspNetworkError,
	tryParseErrorResponse,
} from "./odspErrorUtils.js";
export { getAsync, postAsync, putAsync, unauthPostAsync } from "./odspRequest.js";
