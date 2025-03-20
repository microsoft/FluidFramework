/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as core from "@fluidframework/server-services-core";

/**
 * This is a dummy implementation that returns the secret as is after encryption/decryption.
 * Users requiring encryption of secrets are expected to have their own implementation of ISecretManager.
 * @internal
 */
export class SecretManager implements core.ISecretManager {
	public getLatestKeyVersion(): core.EncryptionKeyVersion {
		return core.EncryptionKeyVersion.key2022;
	}

	public decryptSecret(
		encryptedSecret: string,
		encryptionKeyVersion?: core.EncryptionKeyVersion,
	): string {
		return encryptedSecret;
	}

	public encryptSecret(secret: string, encryptionKeyVersion?: core.EncryptionKeyVersion): string {
		return secret;
	}
}
