/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollection, MongoManager } from "@fluidframework/server-services-core";
import moment from "moment";

/**
 * Interface representing information about a logged in user
 */
export interface IUser {
    id: string;
    details: IUserDetails;
    user: IUser;
    accounts: IAccount[];
}

/**
 * Details about a given user
 */
export interface IUserDetails {
    displayName: string;
    name: {
        familyName: string;
        givenName: string;
    };
}

export interface IAccount {
    // Id of the account
    _id: string;

    // Name of the account provider
    provider: string;

    // Id of the account as given by the provider
    providerId: string;

    // Access information for the account
    accessToken: string;

    // Access token expiration time
    expiration: string;

    // Used to refresh access to the account
    refreshToken: string;

    // The id of the user the account is associated with
    userId: string;
}

/**
 * Wrapper structure to store access tokens
 */
export interface ITokens {
    access: string;
    expiration: string;
    refresh: string;
}

export class AccountManager {
    constructor(private readonly mongoManager: MongoManager, private readonly accountsCollectionName: string) {
    }

    /**
     * Links the given account with the provided user
     */
    public async linkAccount(
        provider: string,
        providerId: string,
        accessToken: string,
        expiration: string,
        refreshToken: string,
        userId: string,
    ): Promise<void> {
        const id = this.getAccountId(userId, provider, providerId);

        const collection = await this.getAccountsCollection();

        const account: IAccount = {
            _id: id,
            accessToken,
            expiration,
            provider,
            providerId,
            refreshToken,
            userId,
        };

        // eslint-disable-next-line no-null/no-null
        await collection.upsert({ _id: id }, account, null);
    }

    /**
     * Loads all information for the given user
     */
    public async getAccounts(userId: string): Promise<IAccount[]> {
        const collection = await this.getAccountsCollection();
        return collection.find({ userId }, {});
    }

    public getTokenExpiration(expires: number): string {
        const expiration = moment().add(expires, "seconds");
        return expiration.utc().toISOString();
    }

    private getAccountId(userId: string, provider: string, providerId: string): string {
        return `${userId}-${provider}-${providerId}`;
    }

    private async getAccountsCollection(): Promise<ICollection<IAccount>> {
        const db = await this.mongoManager.getDatabase();
        return db.collection<IAccount>(this.accountsCollectionName);
    }
}
