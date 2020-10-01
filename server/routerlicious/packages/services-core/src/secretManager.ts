/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface ISecretManager {
    /**
     * Encrypts secret.
     */
    encryptSecret(secret: string): string;

    /**
     * Decrypts secret.
     */
    decryptSecret(encryptedSecret: string): string;
}
