/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export let validationsEnabled = {
    enabled: true,
};

/**
 * Switch off validation to increase performance (but you risk modifying read only properties, creating cycles in
 * the tree, etc...)
 *
 * @param enabled - Are the validations enabled?
 */
export function enableValidations(enabled: boolean) {
    validationsEnabled.enabled = enabled;
}
