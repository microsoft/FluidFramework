import * as accounts from './db/accounts';
import * as users from './db/users';
import { Promise } from 'es6-promise';
import * as _ from 'lodash';

// re-export the database user details
export import IUserDetails = users.IUserDetails;

/**
 * Interface representing information about a logged in user
 */
export interface IUser {
    user: users.IUser
    accounts: accounts.IAccount[]
}

/**
 * Gets or creates a new user
 */
export function createOrGetUser(
    provider: string,
    providerId: string,
    accessToken: string,
    refreshToken: string,
    details: IUserDetails): Promise<any> {

    return accounts.getAccount(provider, providerId).then((account) => {
        // Check to see if there is an account - if not we need to create a new user        
        let userIdP;
        if (account === null) {
            // Create a user first and then link this account to it
            let newUserP = users.putUser(details);
            userIdP = newUserP.then((newUser) => {
                return accounts.linkAccount(provider, providerId, accessToken, refreshToken, newUser.id).then((account) => newUser.id);
            })
        }
        else {
            // Get the user but also go and update the refresh and access token at this point
            account.accessToken = accessToken;
            account.refreshToken = refreshToken;

            var updateAccountP = accounts.updateAccount(account);

            userIdP = updateAccountP.then((resolvedValues) => account.userId);
        }

        // Once we have the user look up all the accounts associated with that user
        return userIdP.then((userId) => {
            return getUser(userId);
        })
    });
}

/**
 * Links the given account with the provided user
 */
export function linkAccount(
    provider: string,
    providerId: string,
    accessToken: string,
    refreshToken: string,
    userId: string): Promise<any> {

    var accountP = accounts.getAccount(provider, providerId);
    return accountP.then((account) => {
        if (account) {
            // Account already linked - throw an error
            throw { msg: "Account already linked" };
        }
        else {
            var linkP = accounts.linkAccount(provider, providerId, accessToken, refreshToken, userId);
            return linkP.then(() => getUser(userId));
        }
    })
}

export function unlinkAccount(user: IUser, accountId: string): Promise<any> {
    // verify that the account belongs to the user
    var foundAccount = _.find(user.accounts, (account) => account.id === accountId);
    if (!foundAccount) {
        throw { error: "Account does not belong to user" };
    }

    return accounts.removeAccount(accountId);
}

/**
 * Loads all information for the given user
 */
export function getUser(userId: string): Promise<IUser> {
    let userP = users.getUser(userId);

    // Once we have the user look up all the accounts associated with that user
    return userP.then((user) => {
        var accountsP = accounts.findAllForUser(user.id);
        return accountsP.then((linkedAccounts) => {
            return {
                user: user,
                accounts: linkedAccounts
            }
        });
    });
}