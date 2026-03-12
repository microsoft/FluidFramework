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
	LoginCredentials,
	OdspTokenManager,
	getMicrosoftConfiguration,
	odspTokensCache,
} from "@fluidframework/tool-utils/internal";
import { compare } from "semver";

import { OdspDriverApi, OdspDriverApiType } from "./odspDriverApi.js";

const passwordTokenConfig = (username: string, password: string): LoginCredentials => ({
	type: "password",
	username,
	password,
});

interface IOdspTestLoginInfo {
	siteUrl: string;
	credentials: LoginCredentials;
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
	UserPrincipalName: string;
	Token: string;
}

interface TestTenantCheckoutClient {
	fetchFicTokens(usernames: string[], tokenScope: "push" | "storage"): Promise<TokenCredentials[]>;
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
): LoginCredentials[] {
	const creds: { username: string; password: string }[] = [];
	const loginTenants =
		odspEndpointName === "odsp"
			? process.env.login__odsp__test__tenants
			: process.env.login__odspdf__test__tenants;

	if (loginTenants !== undefined) {
		/**
		 * Parse login credentials using the new tenant format for e2e tests.
		 * For the expected format of loginTenants, see {@link UserPassCredentials}
		 */
		if (loginTenants.includes("UserPrincipalName")) {
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
		const { siteUrl } = tokenConfig;
		return await getDriveId(siteUrl, "", undefined, {
			accessToken: await this.getStorageToken({ siteUrl, refresh: false }, tokenConfig),
			refreshTokenFn: async () => this.getStorageToken({ siteUrl, refresh: true }, tokenConfig),
		});
	}

	public static async createFromEnv(
		config?: {
			directory?: string;
			username?: string;
			options?: HostStoragePolicy;
			tenantIndex?: number;
			odspEndpointName?: string;
		},
		api: OdspDriverApiType = OdspDriverApi,
	): Promise<OdspTestDriver> {
		const tenantIndex = config?.tenantIndex ?? 0;
		assertOdspEndpoint(config?.odspEndpointName);
		const endpointName = config?.odspEndpointName ?? "odsp";

		// force isolateSocketCache because we are using different users in a single context
		// and socket can't be shared between different users
		const options = config?.options ?? {};
		options.isolateSocketCache = true;

		// Pick a random user (only random selection supported for >= 0.46)
		const randomUserIndex =
			compare(api.version, "0.46.0") >= 0
				? Math.random()
				: OdspTestDriver.legacyDriverUserRandomIndex;

		let credentials: LoginCredentials;
		let userIndex: number;

		// An internal package checks out test tenants, populates user information in the environment, and makes an entrypoint available
		// at this location (token__package__import__location) which supports fetching tokens for those users.
		const packageImportLocation = process.env.token__package__import__location;
		if (packageImportLocation !== undefined) {
			const pkg = await import(packageImportLocation) as TestTenantCheckoutClient;
			if (typeof pkg.fetchFicTokens !== "function") {
				throw new TypeError(
					`Expected package at '${packageImportLocation}' to export fetchFicTokens.`,
				);
			}

			const accountDataEnv = process.env["login__odsp__test__users"];
			if (accountDataEnv === undefined) {
				throw new Error("Missing 'login__odsp__test__users' environment variable.");
			}
			const { usernames } = JSON.parse(accountDataEnv) as { guid: string; usernames: string[] };

			if (usernames.length === 0) {
				throw new Error("login__odsp__test__users does not have any valid usernames.");
			}

			userIndex = Math.floor(randomUserIndex * usernames.length);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const username = usernames[userIndex]!;

			const fetchToken = async (scopeEndpoint: "storage" | "push") => {
				const tokens = await pkg.fetchFicTokens([username], scopeEndpoint);
				if (!Array.isArray(tokens)) {
					// This error indicates a mismatch between the dynamically imported token fetcher package and this code.
					// Double-check that the package specified in 'token__package__import__location' is up to date and its entrypoint
					// matches the typing of `fetchFicTokens` as defined in `TestTenantCheckoutClient`.
					throw new TypeError('Expected fetchFicTokens to return an array of tokens.');
				}
				const token = tokens.find((a) => a.UserPrincipalName === username);
				if (!token) {
					throw new Error(`Unable to fetch token for user ${username} and scope ${scopeEndpoint}`);
				}
				return token.Token;
			};

			credentials = { type: "fic", username, fetchToken };
		} else {
			let creds = getOdspCredentials(endpointName, tenantIndex) as Exclude<LoginCredentials, { type: "browserLogin" }>[];
			if (config?.username !== undefined) {
				// If config requested a specific username, only use that.
				creds = creds.filter((c) => c.username === config.username);
			}
			userIndex = Math.floor(randomUserIndex * creds.length);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			credentials = creds[userIndex]!;
		}

		const { username } = credentials;
		const emailServer = username.substr(username.indexOf("@") + 1);
		let siteUrl: string;
		let tenantName: string;
		if (emailServer.startsWith("http://") || emailServer.startsWith("https://")) {
			tenantName = new URL(emailServer).hostname;
			siteUrl = emailServer;
		} else {
			tenantName = emailServer.substr(0, emailServer.indexOf("."));
			siteUrl = `https://${tenantName}.sharepoint.com`;
		}

		return this.create(
			{ siteUrl, credentials },
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
		loginInfo: IOdspTestLoginInfo,
		directory: string,
		api = OdspDriverApi,
		options?: HostStoragePolicy,
		tenantName?: string,
		userIndex?: number,
		endpointName?: string,
	): Promise<OdspTestDriver> {
		const tokenConfig: TokenConfig = {
			...loginInfo,
			...getMicrosoftConfiguration(),
		};

		const driveId = await this.getDriveId(loginInfo.siteUrl, tokenConfig);
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
			config.credentials,
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
		const tokens = await OdspTestDriver.odspTokenManager.getPushTokens(
			host,
			this.config,
			this.config.credentials,
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
