import { Promise } from "es6-promise";
import * as google from "googleapis";
import * as _ from "lodash";
import * as moment from "moment";
import * as nconf from "nconf";
import * as request from "request";
import * as accounts from "./db/accounts";
import * as users from "./db/users";

// re-export the database user details
export import IUserDetails = users.IUserDetails;

/**
 * Interface representing information about a logged in user
 */
export interface IUser {
    user: users.IUser;
    accounts: accounts.IAccount[];
}

/**
 * Wrapper structure to store access tokens
 */
export interface ITokens {
    access: string;
    expiration: string;
    refresh: string;
}

/**
 * Gets or creates a new user
 */
export function createOrGetUser(
    provider: string,
    providerId: string,
    accessToken: string,
    expiration: string,
    refreshToken: string,
    details: IUserDetails): Promise<any> {

    return accounts.getAccount(provider, providerId).then((account) => {
        // Check to see if there is an account - if not we need to create a new user
        let userIdP;
        if (account === null) {
            // Create a user first and then link this account to it
            let newUserP = users.putUser(details);
            userIdP = newUserP.then((newUser) => {
                return accounts.linkAccount(
                    provider,
                    providerId,
                    accessToken,
                    expiration,
                    refreshToken,
                    newUser.id).then((linkedAccount) => newUser.id);
            });
        } else {
            // Get the user but also go and update the refresh and access token at this point
            account.accessToken = accessToken;
            account.refreshToken = refreshToken;
            account.expiration = expiration;

            let updateAccountP = accounts.updateAccount(account);

            userIdP = updateAccountP.then((resolvedValues) => account.userId);
        }

        // Once we have the user look up all the accounts associated with that user
        return userIdP.then((userId) => {
            return getUser(userId);
        });
    });
}

/**
 * Links the given account with the provided user
 */
export function linkAccount(
    provider: string,
    providerId: string,
    accessToken: string,
    expiration: string,
    refreshToken: string,
    userId: string): Promise<any> {

    let accountP = accounts.getAccount(provider, providerId);
    return accountP.then((account) => {
        if (account) {
            // Account already linked - throw an error
            throw { msg: "Account already linked" };
        } else {
            let linkP = accounts.linkAccount(provider, providerId, accessToken, expiration, refreshToken, userId);
            return linkP.then(() => getUser(userId));
        }
    });
}

export function unlinkAccount(user: IUser, accountId: string): Promise<any> {
    // verify that the account belongs to the user
    let foundAccount = _.find(user.accounts, (account) => account.id === accountId);
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
        let accountsP = accounts.findAllForUser(user.id);
        return accountsP.then((linkedAccounts) => {
            return {
                accounts: linkedAccounts,
                user,
            };
        });
    });
}

export function getTokenExpiration(expires: number): string {
    let expiration = moment().add(expires, "seconds");
    return expiration.utc().toISOString();
}

function refreshTokens(account: accounts.IAccount): Promise<ITokens> {
    let udpatedAccountP = new Promise((resolve, reject) => {
        // TODO should consolidate the account specific behavior behind an interface
        if (account.provider === "microsoft") {
            let microsoftConfiguration = nconf.get("login:microsoft");
            request.post("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
                form: {
                    client_id: microsoftConfiguration.clientId,
                    client_secret: microsoftConfiguration.secret,
                    grant_type: "refresh_token",
                    refresh_token: account.refreshToken,
                },
                json: true,
            }, (error, response, body) => {
                if (error) {
                    reject(error);
                } else {
                    account.accessToken = body.access_token;
                    account.expiration = getTokenExpiration(body.expires_in);
                    resolve(account);
                }
            });
        } else if (account.provider === "google") {
            let googleConfig = nconf.get("login:google");
            let oauth2Client = new google.auth.OAuth2(googleConfig.clientId, googleConfig.secret, "/auth/google");

            // Retrieve tokens via token exchange explained above or set them:
            oauth2Client.setCredentials({ access_token: account.accessToken, refresh_token: account.refreshToken });
            oauth2Client.refreshAccessToken((error, tokens) => {
                if (error) {
                    reject(error);
                } else {
                    account.accessToken = tokens.access_token;
                    account.expiration = moment(tokens.expiry_date).utc().toISOString();
                    account.refreshToken = tokens.refresh_token;
                    resolve(account);
                }
            });
        } else {
            throw { error: "Unknown Provider" };
        }
    });

    // Get the updated account information and then use it to update the DB and then return the tokens back
    return udpatedAccountP.then((updatedAccount: accounts.IAccount) => {
        return accounts.updateAccount(updatedAccount).then(() => {
            return {
                access: updatedAccount.accessToken,
                expiration: updatedAccount.expiration,
                refresh: updatedAccount.refreshToken ,
            };
        });
    });
}

export function getTokensForProvider(user: IUser, provider: string): Promise<ITokens> {
    for (let account of user.accounts) {
        if (account.provider === provider) {
            return getTokens(account);
        }
    }

    return Promise.reject("Tokens don't exist for account");
}

/**
 * Retrieves the access tokens for the given account
 */
export function getTokens(account: accounts.IAccount): Promise<ITokens> {
    let now = moment();
    let expiration = moment(account.expiration);

    let diff = expiration.diff(now);
    if (now.isAfter(expiration)) {
        return refreshTokens(account);
    } else {
        return Promise.resolve({
            access: account.accessToken,
            expiration: account.expiration,
            refresh: account.refreshToken,
        });
    }
}
