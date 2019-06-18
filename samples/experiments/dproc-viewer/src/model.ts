/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthorizationCode, BaseModel, Client, Token, User } from "oauth2-server";

export interface INotaClient extends Client {
    secret: string;
}

export class Model implements BaseModel {
    private tokens = new Array<Token>();
    private codes = new Array<AuthorizationCode>();

    constructor(private clients: INotaClient[]) {
    }

    public async getClient(clientId: string, clientSecret: string): Promise<Client> {
        for (const client of this.clients) {
            if (client.id === clientId && (client.secret === clientSecret || clientSecret === null)) {
                return client;
            }
        }

        return null;
    }

    public async saveToken(token: Token, client: Client, user: User): Promise<Token> {
        const storedToken: Token = {
            accessToken: token.accessToken,
            accessTokenExpiresAt: token.accessTokenExpiresAt,
            client,
            refreshToken: token.refreshToken,
            refreshTokenExpiresAt: token.refreshTokenExpiresAt,
            scope: token.scope,
            user,
        };
        this.tokens.push(storedToken);
        return storedToken;
    }

    public async getAccessToken(accessToken: string): Promise<Token> {
        for (const token of this.tokens) {
            if (token.accessToken === accessToken) {
                return token;
            }
        }

        return null;
    }

    public async saveAuthorizationCode(
        code: AuthorizationCode,
        client: Client,
        user: User): Promise<AuthorizationCode> {

        const storedCode: AuthorizationCode = {
            authorizationCode: code.authorizationCode,
            client,
            expiresAt: code.expiresAt,
            redirectUri: code.redirectUri,
            scope: code.scope,
            user,
        };
        this.codes.push(storedCode);
        return storedCode;
    }

    public async getAuthorizationCode(authorizationCode: string): Promise<AuthorizationCode> {
        for (const code of this.codes) {
            if (code.authorizationCode === authorizationCode) {
                return code;
            }
        }

        return null;
    }

    public async revokeAuthorizationCode(code: AuthorizationCode): Promise<boolean> {
        for (let i = 0; i < this.codes.length; i++) {
            if (this.codes[i].authorizationCode === code.authorizationCode) {
                this.codes.splice(i, 1);
                return true;
            }
        }

        return false;
    }

    // public generateAccessToken?(client: Client, user: User, scope: string): Promise<string> {
    //     throw new Error("Method not implemented.");
    // }

    // public saveAuthorizationCode(
    //     code: OAuth2Server.AuthorizationCode,
    //     client: OAuth2Server.Client,
    //     user: OAuth2Server.User,
    //     callback?: (err?: any, result?: OAuth2Server.AuthorizationCode) => void,
    // ): Promise<OAuth2Server.AuthorizationCode> {
    //     throw new Error("Method not implemented.");
    // }

    // public generateRefreshToken?(
    //     client: OAuth2Server.Client,
    //     user: OAuth2Server.User,
    //     scope: string,
    //     callback?: (err?: any, result?: string) => void,
    // ): Promise<string> {
    //     throw new Error("Method not implemented.");
    // }

    // public generateAuthorizationCode?(
    //     client: OAuth2Server.Client,
    //     user: OAuth2Server.User,
    //     scope: string,
    //     callback?: (err?: any, result?: string) => void,
    // ): Promise<string> {
    //     throw new Error("Method not implemented.");
    // }

    // public validateScope?(
    //     user: OAuth2Server.User,
    //     client: OAuth2Server.Client,
    //     scope: string,
    //     callback?: (err?: any, result?: string | false | 0) => void,
    // ): Promise<string | false | 0> {
    //     throw new Error("Method not implemented.");
    // }

    // public verifyScope(
    //     token: Token,
    //     scope: string,
    //     callback?: (err?: any, result?: boolean) => void,
    // ): Promise<boolean> {
    //     throw new Error("Method not implemented.");
    // }
}
