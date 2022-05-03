/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export function removeAllChildren(element: HTMLElement) {
    // Remove any existing children and attach ourselves
    while (element.lastChild !== null) {
        element.removeChild(element.lastChild);
    }
}
