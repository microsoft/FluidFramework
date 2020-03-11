/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Temporary internal function to check if an origin is OneDrive Consumer.
 * This will not work once/if we start using sharing URLs, but this is enough
 * to begin prototype work.
 * @param origin The origin to check
 */
export function isOdcOrigin(origin: string): boolean {
    return origin.includes("api.onedrive.com");
}

/**
 * Temporary internal function to check if a url is for OneDrive Consumer.
 * This will not work once/if we start using sharing URLs, but this is enough
 * to begin prototype work.
 * @param origin The url to check
 */
export function isOdcUrl(url: string): boolean {
    return isOdcOrigin(new URL(url).origin);
}
