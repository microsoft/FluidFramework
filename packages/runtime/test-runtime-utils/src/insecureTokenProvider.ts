/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType } from "@fluidframework/driver-definitions/internal";
import { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";

import { generateToken } from "./generateToken.js";
import { IInsecureUser } from "./insecureUsers.js";

/**
 * Provides an in memory implementation of {@link @fluidframework/routerlicious-driver#ITokenProvider} that can be
 * used to insecurely connect to the Fluid Relay.
 *
 * As the name implies, this is not secure and should not be used in production.
 * It simply makes examples where authentication is not relevant easier to bootstrap.
 * @sealed
 * @internal
 */
export class InsecureTokenProvider implements ITokenProvider {
	constructor(
		/**
		 * Private server tenantKey for generating tokens.
		 */
		private readonly tenantKey: string,

		/**
		 * User with whom generated tokens will be associated.
		 */
		private readonly user: IInsecureUser,

		/**
		 * Optional. Override of scopes. If a param is not provided, InsecureTokenProvider
		 * will use the default scopes which are document read, write and summarizer write.
		 *
		 * @param scopes - See {@link @fluidframework/protocol-definitions#ITokenClaims.scopes}
		 *
		 * @defaultValue [ ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite ]
		 */
		private readonly scopes?: ScopeType[],

		/**
		 * Optional. Override of attach container scopes. If a param is not provided,
		 * InsecureTokenProvider will use the value of {@link InsecureTokenProvider.scopes}.
		 *
		 * @remarks Common use of this parameter is to allow write for container
		 * attach and just read for all other access. Effectively can create a
		 * create and then read-only client.
		 *
		 * @param attachContainerScopes - See {@link @fluidframework/protocol-definitions#ITokenClaims.scopes}
		 *
		 * @defaultValue {@link InsecureTokenProvider.scopes}
		 */
		private readonly attachContainerScopes?: ScopeType[],
	) {}

	private async fetchToken(tenantId: string, documentId?: string): Promise<ITokenResponse> {
		const generalScopes = this.scopes ?? [
			ScopeType.DocRead,
			ScopeType.DocWrite,
			ScopeType.SummaryWrite,
		];
		const scopes = (documentId ? undefined : this.attachContainerScopes) ?? generalScopes;
		return {
			fromCache: true,
			jwt: generateToken(tenantId, this.tenantKey, scopes, documentId, this.user),
		};
	}

	public readonly fetchOrdererToken = this.fetchToken.bind(this);

	public readonly fetchStorageToken = this.fetchToken.bind(this);
}
