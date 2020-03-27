/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IAqueductAnchor {
    /**
     * Returns the id of the last user that edited this document.
     */
    getLastEditedUserId(): string | undefined;

    /**
     * Returns the timestamp of the last edit to this document.
     */
    getLastEditedTimeStamp(): number | undefined;
}
