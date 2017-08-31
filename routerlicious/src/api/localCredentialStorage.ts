/**
 * General utilties for interacting with locally stored encryption credentials.
 */

import { debug } from "./debug";
import * as encryption from "./encryption";

export interface IUserCredentialPackage {
    user: string;
    keyPackage: encryption.IAsymmetricKeys;
}

export function isUserLoggedIn(): boolean {
    const getUserLoggedIn = localStorage.getItem("userLoggedIn");

    if (!getUserLoggedIn) {
        localStorage.setItem("userLoggedIn", "false"); /* first connection */
        return false;
    } else if (getUserLoggedIn === "false") {
        return false;
    } else {
        return true;
    }
}

export function setLoggedInUser(username, keyPackage): boolean {
    if (localStorage.getItem(username)) {
        debug.log("WARNING: User with name \"" + username + "\" already exists! Overwriting...");
    }
    localStorage.setItem("userLoggedIn", username);
    localStorage.setItem(username, JSON.stringify(keyPackage));

    return true; /* NOTE: insert some error handling...otherwise make this void. */
}

export function getLoggedInUserPackage(): IUserCredentialPackage {
    const getUserLoggedIn = localStorage.getItem("userLoggedIn");
    const userKeys: encryption.IAsymmetricKeys = JSON.parse(localStorage.getItem(getUserLoggedIn));

    return {user: getUserLoggedIn, keyPackage: userKeys};
}

export function logoutUser(): boolean {
    const getUserLoggedIn = localStorage.getItem("userLoggedIn");
    localStorage.removeItem(getUserLoggedIn);
    localStorage.setItem("userLoggedIn", "false");

    return true; /* NOTE: insert some error handling...otherwise make this void. */
}
