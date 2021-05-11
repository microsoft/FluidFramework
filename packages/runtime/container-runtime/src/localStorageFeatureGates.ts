/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Helper to check if the given feature key is set in local storage.
 * @returns the following:
 * - true, if the key is set and the value is "1".
 * - false, if the key is set and the value is "0".
 * - undefined, if local storage is not available or the key is not set.
 */
export function getLocalStorageFeatureGate(key: string): boolean | undefined {
    try {
        if (typeof localStorage === "object" && localStorage !== null) {
            const itemValue = localStorage.getItem(key);
            if  (itemValue === "1") {
                return true;
            }
            if (itemValue === "0") {
                return false;
            }
        }
    } catch (e) {}

    return undefined;
}
