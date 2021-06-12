/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TinyliciousClient } from "..";

export class ResettableTinyliciousClient extends TinyliciousClient {
    static resetInstance() {
        TinyliciousClient.globalInstance = undefined;
    }
}
