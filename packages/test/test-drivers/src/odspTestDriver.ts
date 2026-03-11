/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import os from "os";

import { ITestDriver, OdspEndpoint } from "@fluid-internal/test-driver-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import {
	IDocumentServiceFactory,
	IUrlResolver,
	type IPersistedCache,
} from "@fluidframework/driver-definitions/internal";
import {
	IPublicClientConfig,
	getDriveId,
	getDriveItemByRootFileName,
} from "@fluidframework/odsp-doclib-utils/internal";
import type {
	HostStoragePolicy,
	OdspResourceTokenFetchOptions,
} from "@fluidframework/odsp-driver-definitions/internal";
import {
	LoginConfig,
	OdspTokenManager,
	getMicrosoftConfiguration,
	odspTokensCache,
} from "@fluidframework/tool-utils/internal";
import { compare } from "semver";

import { OdspDriverApi, OdspDriverApiType } from "./odspDriverApi.js";

const passwordTokenConfig = (username: string, password: string): LoginConfig => ({
	type: "password",
	username,
	password,
});

/**
 * Creates a token config for bearer token authentication (FIC flow).
 * @param username - The user principal name
 * @param token - The bearer token (JWT)
 * @param getNewToken - Callback to fetch a new token when the current one expires
 */
const createBearerTokenConfig = (
	username: string,
	token: string,
	getNewToken: (
		bearerToken: string,
		scopeEndpoint: string,
		numAccounts?: number,
	) => Promise<{ GUID: string; UserPrincipalName: string; Token: string }>,
): LoginConfig => {
	return {
		type: "existingToken",
		username,
		token,
		getNewToken,
	};
};

interface IOdspTestLoginInfo {
	siteUrl: string;
	loginConfig: LoginConfig;
}

type TokenConfig = IOdspTestLoginInfo & IPublicClientConfig;

interface IOdspTestDriverConfig extends TokenConfig {
	directory: string;
	driveId: string;
	options: HostStoragePolicy | undefined;
}

// specific a range of user name from <prefix><start> to <prefix><start + count - 1> all having the same password
interface LoginTenantRange {
	prefix: string;
	start: number;
	count: number;
	password: string;
}

interface LoginTenants {
	[tenant: string]: {
		range: LoginTenantRange;
		// add different format here
	};
}

/**
 * A simplified version of the credentials returned by the tenant pool containing only username and password values.
 */
export interface UserPassCredentials {
	UserPrincipalName: string;
	Password: string;
}

/**
 * Credentials containing a username and bearer token for FIC authentication scenarios.
 */
export interface TokenCredentials {
	GUID: string;
	UserPrincipalName: string;
	Token: string;
}

interface AccountReservation {
	/** GUID for the storage (ODSP) account reservation, used to release accounts when done. */
	odspGuid: string;
	/** GUID for the push channel account reservation, used to release accounts when done. */
	pushGuid: string;
	/** Accounts with storage (ODSP) tokens. */
	odspAccounts: TokenCredentials[];
	/** Accounts with push channel tokens. */
	pushAccounts: TokenCredentials[];
}

interface TestTenantCheckoutClient {
	/**
	 * Returns a reservation of accounts from the tenant pool for testing, including the necessary tokens for authentication.
	 * If invoked multiple times without releasing accounts, it should return the same reservation to allow reuse of accounts across tests.
	 */
	reserveApmAccounts(): Promise<AccountReservation>;
	/**
	 * Return a reservation of accounts back to the tenant pool.
	 * Subsequent calls to reserveApmAccounts may return different accounts once previous accounts have been released.
	 */
	releaseTestAccounts(odspGuid: string, pushGuid: string): Promise<void>;
}

/**
 * Asserts that the endpoint is a valid ODSP endpoint or `undefined`.
 *
 * @internal
 */
export function assertOdspEndpoint(
	endpoint: string | undefined,
): asserts endpoint is OdspEndpoint | undefined {
	if (endpoint === undefined || endpoint === "odsp" || endpoint === "odsp-df") {
		return;
	}
	throw new TypeError("Not a odsp endpoint");
}

/**
 * Get from the env a set of credentials to use from a single tenant
 * @param tenantIndex - integer to choose the tenant from array of options (if multiple tenants are available)
 * @param requestedUserName - specific user name to filter to
 * @internal
 */
export function getOdspCredentials(
	odspEndpointName: OdspEndpoint,
	tenantIndex: number,
): LoginConfig[] {
	const creds: { username: string; password: string }[] = [];
	const loginTenants =
		odspEndpointName === "odsp"
			? process.env.login__odsp__test__tenants
			: process.env.login__odspdf__test__tenants;

	if (loginTenants !== undefined) {
		/**
		 * Parse login credentials using the new tenant format for e2e tests.
		 * For the expected format of loginTenants, see {@link UserPassCredentials} or {@link TokenCredentials}
		 */
		if (loginTenants.includes("GUID")) {
			// Token-based credentials (FIC flow)
			const output: TokenCredentials[] = JSON.parse(loginTenants);
			if (output?.[tenantIndex] === undefined) {
				throw new Error("No resources found in the login tenants");
			}

			// Return the set of accounts to choose from a single tenant
			// Token is passed in the password field for compatibility
			return output.map((account) => createBearerTokenConfig(account.UserPrincipalName, account.Token, async (bearerToken, scopeEndpoint, numAccounts) => {
				// Main problem here is that if token refresh triggers mid-test, we don't necessarily have
				throw new Error("TODO: Figure out how token refresh should work.");
			}));
		} else if (loginTenants.includes("UserPrincipalName")) {
			// Password-based credentials (OAuth flow)
			const output: UserPassCredentials[] = JSON.parse(loginTenants);
			if (output?.[tenantIndex] === undefined) {
				throw new Error("No resources found in the login tenants");
			}

			// Return the set of accounts to choose from a single tenant

			return output.map((account) => passwordTokenConfig(account.UserPrincipalName, account.Password));
		} else {
			/**
			 * Parse login credentials using the tenant format for stress tests.
			 * For the expected format of loginTenants, see {@link LoginTenants}
			 */
			const tenants: LoginTenants = JSON.parse(loginTenants);
			const tenantNames = Object.keys(tenants);
			const tenant = tenantNames[tenantIndex % tenantNames.length];
			if (tenant === undefined) {
				throw new Error("tenant should not be undefined when getting odsp credentials");
			}
			const tenantInfo = tenants[tenant];
			if (tenantInfo === undefined) {
				throw new Error("tenantInfo should not be undefined when getting odsp credentials");
			}
			// Translate all the user from that user to the full user principal name by appending the tenant domain
			const range = tenantInfo.range;

			// Return the set of account to choose from a single tenant
			for (let i = 0; i < range.count; i++) {
				const username = `${range.prefix}${range.start + i}@${tenant}`;
				creds.push({ username, password: range.password });
			}
		}
	} else {
		const loginAccounts =
			odspEndpointName === "odsp"
				? process.env.login__odsp__test__accounts
				: process.env.login__odspdf__test__accounts;
		if (loginAccounts === undefined) {
			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			const inCi = !!process.env.TF_BUILD;
			const odspOrOdspdf = odspEndpointName === "odsp" ? "odsp" : "odspdf";
			assert.fail(
				`Missing secrets from environment. At least one of login__${odspOrOdspdf}__test__tenants or login__${odspOrOdspdf}__test__accounts must be set.${
					inCi ? "" : "\n\nRun getkeys to populate these environment variables."
				}`,
			);
		}

		// Expected format of login__odsp__test__accounts is simply string key-value pairs of username and password
		const passwords: { [user: string]: string } = JSON.parse(loginAccounts);

		// Need to choose one out of the set as these account might be from different tenant
		const username = Object.keys(passwords)[0];
		if (username === undefined) {
			throw new Error("username should not be undefined when getting odsp credentials");
		}
		const userPass = passwords[username];
		if (userPass === undefined) {
			throw new Error(
				"password for username should not be undefined when getting odsp credentials",
			);
		}
		creds.push({ username, password: userPass });
	}
	return creds.map((c) => passwordTokenConfig(c.username, c.password));
}

/**
 * @internal
 */
export class OdspTestDriver implements ITestDriver {
	// Share the tokens and driverId across multiple instance of the test driver
	private static readonly odspTokenManager = new OdspTokenManager(odspTokensCache);
	private static readonly driveIdPCache = new Map<string, Promise<string>>();
	// Choose a single random user up front for legacy driver which doesn't support isolateSocketCache
	private static readonly legacyDriverUserRandomIndex = Math.random();


	private static async getDriveIdFromConfig(tokenConfig: TokenConfig): Promise<string> {
		const { siteUrl, loginConfig } = tokenConfig;
		return await getDriveId(siteUrl, "", undefined, {
			accessToken: await this.getStorageToken({ siteUrl, refresh: false }, tokenConfig),
			refreshTokenFn: loginConfig.type === "existingToken"
				? async () => {
					const result = await loginConfig.getNewToken(process.env.bearer__token as string, "storage");
					return result.Token;
				}
				: async () => this.getStorageToken({ siteUrl, refresh: true }, tokenConfig),
		});
	}

	public static async createFromEnv(
		config?: {
			directory?: string;
			username?: string;
			options?: HostStoragePolicy;
			tenantIndex?: number;
			odspEndpointName?: string;
			/**
			 * Optional callback to fetch new bearer tokens when they expire.
			 * Used for FIC authentication that doesn't support OAuth refresh tokens.
			 */
			getNewToken?: (
				bearerToken: string,
				scopeEndpoint: string,
				numAccounts?: number,
			) => Promise<{ GUID: string; UserPrincipalName: string; Token: string }>;
		},
		api: OdspDriverApiType = OdspDriverApi,
	): Promise<OdspTestDriver> {
		const tenantIndex = config?.tenantIndex ?? 0;
		assertOdspEndpoint(config?.odspEndpointName);
		const endpointName = config?.odspEndpointName ?? "odsp";
		let creds = getOdspCredentials(endpointName, tenantIndex) as Exclude<LoginConfig, { type: "browserLogin" }>[];
		if (config?.username !== undefined) {
			// If config requested a specific username, only use that.
			creds = creds.filter((c) => c.username === config.username);
		}
		// Pick a random one on the list (only supported for >= 0.46)
		const randomUserIndex =
			compare(api.version, "0.46.0") >= 0
				? Math.random()
				: OdspTestDriver.legacyDriverUserRandomIndex;
		const userIndex = Math.floor(randomUserIndex * creds.length);
		// Bounds check above guarantees non-null (at least at compile time, assuming all types are respected)
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const loginConfig = creds[userIndex]!;
		const { username } = loginConfig;

		const emailServer = username.substr(username.indexOf("@") + 1);

		let siteUrl: string;
		let tenantName: string;
		if (emailServer.startsWith("http://") || emailServer.startsWith("https://")) {
			// it's already a site url
			tenantName = new URL(emailServer).hostname;
			siteUrl = emailServer;
		} else {
			tenantName = emailServer.substr(0, emailServer.indexOf("."));
			siteUrl = `https://${tenantName}.sharepoint.com`;
		}

		// force isolateSocketCache because we are using different users in a single context
		// and socket can't be shared between different users
		const options = config?.options ?? {};
		options.isolateSocketCache = true;

		if (process.env.token__package__import__location === undefined) {
			throw new Error(
				"Missing package specifier for token retrieval. Please set the environment variable token__package__import__location to the package that exports a TestTenantCheckoutClient.",
			);
		}
		const testTenantClient = await import(process.env.token__package__import__location) as TestTenantCheckoutClient;
		if (typeof testTenantClient.releaseTestAccounts !== "function" || typeof testTenantClient.reserveApmAccounts !== "function") {
			throw new TypeError(
				`Expected package at location '${process.env.token__package__import__location}' to export a valid implementation of TestTenantCheckoutClient'.`,
			);
		}

		return this.create(
			{
				siteUrl,
				loginConfig,
			},
			config?.directory ?? "",
			api,
			options,
			tenantName,
			userIndex,
			endpointName,
		);
	}

	private static async getDriveId(siteUrl: string, tokenConfig: TokenConfig): Promise<string> {
		let driveIdP = this.driveIdPCache.get(siteUrl);
		if (driveIdP) {
			return driveIdP;
		}

		driveIdP = this.getDriveIdFromConfig(tokenConfig);
		this.driveIdPCache.set(siteUrl, driveIdP);
		try {
			return await driveIdP;
		} catch (e) {
			this.driveIdPCache.delete(siteUrl);
			throw e;
		}
	}

	private static async create(
		loginConfig: IOdspTestLoginInfo,
		directory: string,
		api = OdspDriverApi,
		options?: HostStoragePolicy,
		tenantName?: string,
		userIndex?: number,
		endpointName?: string,
	): Promise<OdspTestDriver> {
		const tokenConfig: TokenConfig = {
			...loginConfig,
			...getMicrosoftConfiguration(),
		};

		const driveId = await this.getDriveId(loginConfig.siteUrl, tokenConfig);
		const directoryParts = [directory];

		// if we are in a azure dev ops build use the build id in the dir path
		if (process.env.BUILD_BUILD_ID !== undefined) {
			directoryParts.push(process.env.BUILD_BUILD_ID);
		} else {
			directoryParts.push(os.hostname());
		}

		const driverConfig: IOdspTestDriverConfig = {
			...tokenConfig,
			directory: directoryParts.join("/"),
			driveId,
			options,
		};

		return new OdspTestDriver(driverConfig, api, tenantName, userIndex, endpointName);
	}

	private static async getStorageToken(
		options: OdspResourceTokenFetchOptions,
		config: TokenConfig,
	): Promise<string> {
		const host = new URL(options.siteUrl).host;
		const tokens = await this.odspTokenManager.getOdspTokens(
			host,
			config,
			config.loginConfig,
			options.refresh,
		);
		return tokens.accessToken;
	}

	public readonly type = "odsp";
	public get version(): string {
		return this.api.version;
	}
	private readonly testIdToUrl = new Map<string, string>();
	private cache?: IPersistedCache;
	private constructor(
		private readonly config: Readonly<IOdspTestDriverConfig>,
		private readonly api = OdspDriverApi,
		public readonly tenantName?: string,
		public readonly userIndex?: number,
		public readonly endpointName?: string,
	) {}

	/**
	 * Returns the url to container which can be used to load the container through loader.
	 * @param testId - Filename of the Fluid file. Note: This is not the container id as for odsp
	 * container id is the hashed id generated using driveId and itemId. Container id is not the filename.
	 */
	async createContainerUrl(testId: string): Promise<string> {
		if (!this.testIdToUrl.has(testId)) {
			const siteUrl = this.config.siteUrl;
			const driveItem = await getDriveItemByRootFileName(
				this.config.siteUrl,
				undefined,
				`/${this.config.directory}/${testId}.tstFluid`,
				{
					accessToken: await this.getStorageToken({ siteUrl, refresh: false }),
					refreshTokenFn: async () => this.getStorageToken({ siteUrl, refresh: false }),
				},
				false,
				this.config.driveId,
			);

			this.testIdToUrl.set(
				testId,
				this.api.createOdspUrl({
					...driveItem,
					siteUrl,
					dataStorePath: "/",
				}),
			);
		}
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.testIdToUrl.get(testId)!;
	}

	public setPersistedCache(cache: IPersistedCache): void {
		this.cache = cache;
	}

	createDocumentServiceFactory(): IDocumentServiceFactory {
		const documentServiceFactory = new this.api.OdspDocumentServiceFactory(
			this.getStorageToken.bind(this),
			this.getPushToken.bind(this),
			this.cache,
			this.config.options,
		);
		// Automatically reset the cache after creating the factory
		this.cache = undefined;
		return documentServiceFactory;
	}

	createUrlResolver(): IUrlResolver {
		return new this.api.OdspDriverUrlResolver();
	}

	createCreateNewRequest(testId: string): IRequest {
		return this.api.createOdspCreateContainerRequest(
			this.config.siteUrl,
			this.config.driveId,
			this.config.directory,
			`${testId}.tstFluid`,
		);
	}

	private async getStorageToken(options: OdspResourceTokenFetchOptions): Promise<string> {
		return OdspTestDriver.getStorageToken(options, this.config);
	}

	private async getPushToken(options: OdspResourceTokenFetchOptions): Promise<string> {
		const host = new URL(options.siteUrl).host;

		// // Check if this is a bearer token (FIC flow)
		// if (this.config.password.startsWith("eyJ") && this.config.getNewToken) {
		// 	const token = await OdspTestDriver.odspTokenManager.getPushTokens(
		// 		host,
		// 		this.config,
		// 		createBearerTokenConfig(
		// 			this.config.username,
		// 			this.config.password,
		// 			this.config.getNewToken,
		// 		),
		// 		options.refresh,
		// 	);
		// 	return token.accessToken;
		// }

		const tokens = await OdspTestDriver.odspTokenManager.getPushTokens(
			host,
			this.config,
			this.config.loginConfig,
			options.refresh,
		);

		return tokens.accessToken;
	}

	public getUrlFromItemId(itemId: string): string {
		return this.api.createOdspUrl({
			siteUrl: this.config.siteUrl,
			driveId: this.config.driveId,
			itemId,
			dataStorePath: "/",
		});
	}
}
