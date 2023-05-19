/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EncryptionKeyName } from "./tenant";

export interface ISecretManager {
	/**
	 * Encrypts secret.
	 */
	encryptSecret(secret: string, encryptionKeyName?: EncryptionKeyName): string;

	/**
	 * Decrypts secret.
	 */
	decryptSecret(encryptedSecret: string, encryptionKeyName?: EncryptionKeyName): string;
}
