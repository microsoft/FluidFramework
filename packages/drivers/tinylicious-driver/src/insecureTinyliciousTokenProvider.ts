/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenClaims, ScopeType } from "@fluidframework/driver-definitions/internal";
import { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
import { KJUR as jsrsasign } from "jsrsasign";
import { v4 as uuid } from "uuid";

/**
 * As the name implies this is not secure and should not be used in production. It simply makes the example easier
 * to get up and running.
 * @legacy
 * @alpha
 */
export class InsecureTinyliciousTokenProvider implements ITokenProvider {
	constructor(
		/**
		 * Optional. Override of scopes. If a param is not provided, InsecureTinyliciousTokenProvider
		 * will use the default scopes which are document read, write and summarizer write.
		 *
		 * @param scopes - See {@link @fluidframework/protocol-definitions#ITokenClaims.scopes}
		 *
		 * @defaultValue [ ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite ]
		 */
		private readonly scopes?: ScopeType[],
	) {}

	public async fetchOrdererToken(
		tenantId: string,
		documentId?: string,
	): Promise<ITokenResponse> {
		return {
			fromCache: true,
			jwt: this.getSignedToken(tenantId, documentId),
		};
	}

	public async fetchStorageToken(
		tenantId: string,
		documentId: string,
	): Promise<ITokenResponse> {
		return {
			fromCache: true,
			jwt: this.getSignedToken(tenantId, documentId),
		};
	}

	private getSignedToken(
		tenantId: string,
		documentId: string | undefined,
		lifetime: number = 60 * 60,
		ver: string = "1.0",
	): string {
		const userId = uuid();
		const match = userId.match(/^([\da-f]{8})-([\da-f]{4})/);
		const userName = match === null ? userId : match[0]; // Just use the first two segments of the (fake) userId as a fake name.

		// Current time in seconds
		const now = Math.round(Date.now() / 1000);
		const user = { id: userId, name: userName };

		const claims: ITokenClaims = {
			documentId: documentId ?? "",
			scopes: this.scopes ?? [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
			tenantId,
			user,
			iat: now,
			exp: now + lifetime,
			ver,
		};

		const utf8Key = { utf8: "12345" };
		return jsrsasign.jws.JWS.sign(
			// External API uses `null`
			// eslint-disable-next-line unicorn/no-null
			null,
			JSON.stringify({ alg: "HS256", typ: "JWT" }),
			claims,
			utf8Key,
		);
	}
}
