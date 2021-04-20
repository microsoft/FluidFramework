/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as core from "@fluidframework/server-services-core";

/**
 * This is a dummy implementation that returns the secret as is after encryption/decryption.
 * Users requiring encryption of secrets are expected to have their own implementation of ISecretManager.
 */
export class SecretManager  implements core.ISecretManager {
    public decryptSecret(encryptedSecret: string): string {
        return encryptedSecret;
    }

    public encryptSecret(secret: string): string {
        return secret;
    }
}
