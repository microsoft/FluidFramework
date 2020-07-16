/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getSharepointTenant } from "./odspUtils";

export interface IOdspTokens {
    accessToken: string;
    refreshToken: string;
}

export interface IClientConfig {
    clientId: string;
    clientSecret: string;
}

export type AuthGrant = {
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

//* Rename? and AuthGrant
export type AuthParams =
    AuthGrant & {
        client_id: string,
        client_secret: string,
        scope: string,
    };

export const getOdspScope = (server: string) => `offline_access https://${server}/AllSites.Write`;
export const pushScope = "offline_access https://pushchannel.1drv.ms/PushChannel.ReadWrite.All";

export function getFetchTokenUrl(server: string): string {
    return `https://login.microsoftonline.com/${getSharepointTenant(server)}/oauth2/v2.0/token`;
}

export function getAuthorizePageUrl(
    isPush: boolean,
    server: string,
    clientConfig: IClientConfig,
    scope: string,
    odspAuthRedirectUri: string,
) {
    const tenant = isPush ? "organizations" : getSharepointTenant(server);
    return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?`
        + `client_id=${clientConfig.clientId}`
        + `&scope=${scope}`
        + `&response_type=code`
        + `&redirect_uri=${odspAuthRedirectUri}`;
}
