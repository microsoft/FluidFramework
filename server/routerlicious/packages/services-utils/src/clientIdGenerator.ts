/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as moniker from "moniker";

export function generateClientId(): string {
    return moniker.choose();
}
