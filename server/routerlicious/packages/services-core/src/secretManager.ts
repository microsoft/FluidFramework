/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EncryptionKeyVersion } from "./tenant";

export interface ISecretManager {
	/**
	 * Gets incoming encryption key version.
	 */
	getIncomingKeyVersion(): EncryptionKeyVersion;

	/**
	 * Encrypts secret.
	 */
	encryptSecret(
		secret: string,
		encryptionKeyVersion?: EncryptionKeyVersion,
	): string;

	/**
	 * Decrypts secret.
	 */
	decryptSecret(
		encryptedSecret: string,
		encryptionKeyVersion?: EncryptionKeyVersion,
	): string;
}
