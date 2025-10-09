/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { EncryptionKeyVersion } from "./tenant";

/**
 * @internal
 */
export interface ISecretManager {
	/**
	 * Gets incoming encryption key version.
	 */
	getLatestKeyVersion(): EncryptionKeyVersion;

	/**
	 * Encrypts secret.
	 */
	encryptSecret(secret: string, encryptionKeyVersion?: EncryptionKeyVersion): string;

	/**
	 * Decrypts secret.
	 */
	decryptSecret(encryptedSecret: string, encryptionKeyVersion?: EncryptionKeyVersion): string;
}
