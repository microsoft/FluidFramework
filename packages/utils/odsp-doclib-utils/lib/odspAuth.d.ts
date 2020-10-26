/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
export interface IOdspTokens {
    accessToken: string;
    refreshToken: string;
}
export interface IClientConfig {
    clientId: string;
    clientSecret: string;
}
export interface IOdspAuthRequestInfo {
    accessToken: string;
    refreshTokenFn?: () => Promise<string>;
}
export declare type TokenRequestCredentials = {
    grant_type: "authorization_code";
    code: string;
    redirect_uri: string;
} | {
    grant_type: "refresh_token";
    refresh_token: string;
} | {
    grant_type: "password";
    username: string;
    password: string;
};
export declare const getOdspScope: (server: string) => string;
export declare const pushScope = "offline_access https://pushchannel.1drv.ms/PushChannel.ReadWrite.All";
export declare function getFetchTokenUrl(server: string): string;
export declare function getLoginPageUrl(isPush: boolean, server: string, clientConfig: IClientConfig, scope: string, odspAuthRedirectUri: string): string;
export declare const getOdspRefreshTokenFn: (server: string, clientConfig: IClientConfig, tokens: IOdspTokens) => () => Promise<string>;
export declare const getPushRefreshTokenFn: (server: string, clientConfig: IClientConfig, tokens: IOdspTokens) => () => Promise<string>;
export declare const getRefreshTokenFn: (scope: string, server: string, clientConfig: IClientConfig, tokens: IOdspTokens) => () => Promise<string>;
/**
 * Fetch an access token and refresh token from AAD
 * @param server - The server to auth against
 * @param scope - The desired oauth scope
 * @param clientConfig - Info about this client's identity
 * @param credentials - Credentials authorizing the client for the requested token
 */
export declare function fetchTokens(server: string, scope: string, clientConfig: IClientConfig, credentials: TokenRequestCredentials): Promise<IOdspTokens>;
/**
 * Fetch fresh tokens and update the provided tokens object with them
 * @param server - The server to auth against
 * @param scope - The desired oauth scope
 * @param clientConfig - Info about this client's identity
 * @param tokens - The tokens object to update with fresh tokens. Also provides the refresh token for the request
 */
export declare function refreshTokens(server: string, scope: string, clientConfig: IClientConfig, tokens: IOdspTokens): Promise<void>;
/**
 * Issue the requestCallback, providing the proper auth header based on authRequestInfo,
 * and retrying with a refreshed token if necessary.
 */
export declare function authRequestWithRetry(authRequestInfo: IOdspAuthRequestInfo, requestCallback: (config: RequestInit) => Promise<Response>): Promise<Response>;
//# sourceMappingURL=odspAuth.d.ts.map