/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as appauth from "@openid/appauth";
import { NodeBasedHandler, NodeRequestor } from "@openid/appauth/built/node_support";
import { api } from "@prague/routerlicious";
import * as webRequest from "request-promise-native";

// Following example at https://github.com/googlesamples/appauth-js-electron-sample

export class TokenManager {
    private configuration: appauth.AuthorizationServiceConfiguration;
    private notifier: appauth.AuthorizationNotifier;
    private requestor: NodeRequestor;
    private authorizationHandler: NodeBasedHandler;
    private tokenHandler: appauth.BaseTokenRequestHandler;

    private refreshToken: string;
    private accessTokenResponse: appauth.TokenResponse;

    private authorizationRequestDeferred: api.utils.Deferred<void>;

    constructor(
        private serverUri: string,
        private clientId: string,
        private clientSecret: string,
        private redirectUri: string,
        private scope: string) {

        this.configuration = new appauth.AuthorizationServiceConfiguration(
            `${this.serverUri}/auth/oauth/auth`,
            `${this.serverUri}/auth/oauth/token`,
            `${this.serverUri}/auth/oauth/auth`);

        this.notifier = new appauth.AuthorizationNotifier();
        this.requestor = new NodeRequestor();
        this.tokenHandler = new appauth.BaseTokenRequestHandler(this.requestor);
        this.authorizationHandler = new NodeBasedHandler();

        this.authorizationHandler.setAuthorizationNotifier(this.notifier);

        this.notifier.setAuthorizationListener(async (request, response, error) => {
            console.log("Hey I got a response!");
            if (response) {
                await this.makeRefreshTokenRequest(response.code);
                await this.performWithFreshTokens();
                this.authorizationRequestDeferred.resolve();
            }
        });
    }

    public async getNotesToken(): Promise<string> {
        const token = await this.getAccessToken();
        return webRequest.post(
            `${this.serverUri}/api/me/tokens/notes`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                json: true,
            });
    }

    public async getWindowsTokens(): Promise<string> {
        const token = await this.getAccessToken();
        return webRequest.post(
            `${this.serverUri}/api/me/tokens/windows`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                json: true,
            });
    }

    public async getTokenForNote(id: string): Promise<string> {
        const token = await this.getAccessToken();
        return webRequest.post(
            `${this.serverUri}/api/me/tokens/notes/${encodeURIComponent(id)}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                json: true,
            });
    }

    private async getAccessToken(): Promise<string> {
        await this.makeAuthorizationRequest();
        return this.performWithFreshTokens();
    }

    private makeAuthorizationRequest(): Promise<void> {
        if (!this.authorizationRequestDeferred) {
            this.authorizationRequestDeferred = new api.utils.Deferred<void>();
            const request = new appauth.AuthorizationRequest(
                this.clientId,
                this.redirectUri,
                this.scope,
                appauth.AuthorizationRequest.RESPONSE_TYPE_CODE,
                undefined,
                { prompt: "consent", access_type: "offline", client_secret: this.clientSecret });

            this.authorizationHandler.performAuthorizationRequest(this.configuration, request);
        }

        return this.authorizationRequestDeferred.promise;
    }

    private async makeRefreshTokenRequest(code: string): Promise<void> {
        const request = new appauth.TokenRequest(
            this.clientId,
            this.redirectUri,
            appauth.GRANT_TYPE_AUTHORIZATION_CODE,
            code,
            undefined,
            { client_secret: this.clientSecret });

        const response = await this.tokenHandler.performTokenRequest(this.configuration, request);
        this.refreshToken = response.refreshToken;
        this.accessTokenResponse = response;
    }

    private async performWithFreshTokens(): Promise<string> {
        if (!this.refreshToken) {
            return Promise.reject("No refresh token");
        }

        if (this.accessTokenResponse && this.accessTokenResponse.isValid()) {
            return this.accessTokenResponse.accessToken;
        }

        const request = new appauth.TokenRequest(
            this.clientId,
            this.redirectUri,
            appauth.GRANT_TYPE_REFRESH_TOKEN,
            undefined,
            this.refreshToken,
            { client_secret: this.clientSecret });
        const response = await this.tokenHandler.performTokenRequest(this.configuration, request);
        this.accessTokenResponse = response;

        return response.accessToken;
    }
}
