/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Promise } from "es6-promise";
import * as connection from "./connection";

const collectionName = "accounts";

let collection = connection.getOrCreateCollection(collectionName);

export interface IAccount {
    // Id of the account
    id: string;

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

function getAccountId(provider: string, providerId: string): string {
    return `${provider}-${providerId}`;
}

export function getAccount(provider: string, providerId: string): Promise<IAccount> {
    let id = getAccountId(provider, providerId);
    return collection.read(id);
}

export function removeAccount(id: string): Promise<any> {
    return collection.delete(id);
}

export function linkAccount(
    provider: string,
    providerId: string,
    accessToken: string,
    expiration: string,
    refreshToken: string,
    userId: string) {

    let account: IAccount = {
        id: getAccountId(provider, providerId),
        provider,
        providerId,
        accessToken,
        expiration,
        refreshToken,
        userId,
    };

    return collection.create(account);
}

export function updateAccount(account: IAccount) {
    return collection.replace(account);
}

export function findAllForUser(userId: string): Promise<IAccount[]> {
    return collection.query(
        "SELECT * FROM users WHERE users.userId=@userId",
        [{ name: "@userId", value: userId }]);
}
