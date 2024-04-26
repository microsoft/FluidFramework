/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as crypto from "crypto";

/**
 * Interface for generating tenant keys.
 */
export interface ITenantKeyGenerator {
	/**
	 * Generates a tenant key.
	 */
	generateTenantKey(): string;
}

export class TenantKeyGenerator implements ITenantKeyGenerator {
	public generateTenantKey(): string {
		return crypto.randomBytes(16).toString("hex");
	}
}
