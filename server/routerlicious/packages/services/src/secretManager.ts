/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as core from "@fluidframework/server-services-core";

/**
 * Manages encryption of secrets.
 */
export class SecretManager  implements core.ISecretManager {
    public decryptSecret(encryptedSecret: string): string {
        /** Add your custom implementation here. */
        return encryptedSecret;
    }

    public encryptSecret(secret: string): string {
        /** Add your custom implementation here. */
        return secret;
    }
}
