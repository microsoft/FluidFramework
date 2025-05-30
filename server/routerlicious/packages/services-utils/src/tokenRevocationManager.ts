/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NetworkError } from "@fluidframework/server-services-client";
import {
	ITokenRevocationManager,
	IRevokedTokenChecker,
	ITokenRevocationResponse,
} from "@fluidframework/server-services-core";

/**
 * @internal
 */
export class DummyRevokedTokenChecker implements IRevokedTokenChecker {
	public async isTokenRevoked(
		tenantId: string,
		documentId: string,
		jwtId: string,
	): Promise<boolean> {
		// Lumberjack.debug(`DummyRevokedTokenChecker isTokenRevoked called`);
		return false;
	}
}

/**
 * @internal
 */
export class DummyTokenRevocationManager implements ITokenRevocationManager {
	public async start() {
		// Lumberjack.debug(`DummyTokenRevocationManager started`);
	}

	public async initialize(): Promise<void> {
		// Lumberjack.debug(`DummyTokenRevocationManager initialize called`);
	}

	public async close(): Promise<void> {
		// Lumberjack.debug(`DummyTokenRevocationManager closed`);
	}

	// Revoke the access of a token given its jwtId
	public async revokeToken(
		tenantId: string,
		documentId: string,
		jwtId: string,
	): Promise<ITokenRevocationResponse> {
		// Lumberjack.debug(`DummyTokenRevocationManager revokeToken called`);
		throw new NetworkError(501, "Token revocation is not supported for now", false, true);
	}
}
