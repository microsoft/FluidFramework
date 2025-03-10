/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import os from "os";

import { ITestDriver, OdspEndpoint } from "@fluid-internal/test-driver-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import {
	IDocumentServiceFactory,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import {
	IPublicClientConfig,
	getDriveId,
	getDriveItemByRootFileName,
} from "@fluidframework/odsp-doclib-utils/internal";
import type {
	HostStoragePolicy,
	IPersistedCache,
	OdspResourceTokenFetchOptions,
} from "@fluidframework/odsp-driver-definitions/internal";
import {
	OdspTokenConfig,
	OdspTokenManager,
	getMicrosoftConfiguration,
	odspTokensCache,
} from "@fluidframework/tool-utils/internal";
import { compare } from "semver";

import { OdspDriverApi, OdspDriverApiType } from "./odspDriverApi.js";

const passwordTokenConfig = (username, password): OdspTokenConfig => ({
	type: "password",
	username,
	password,
});

interface IOdspTestLoginInfo {
	siteUrl: string;
	username: string;
	password: string;
	supportsBrowserAuth?: boolean;
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
 * Properties of the credentials for an individual user returned from the TRIPS API.
 */
export interface CredentialProperties {
	UserPrincipalName: string;
	TenantId: string;
	Password: string;
	TestAssetId: string;
	ExpirationDate: string;
	LeaseExpirationDate: string;
}
/**
 * Response type from the TRIPS API.
 * Within the top-level resources array, each entry is a user with the account
 * name, password, etc detailed in properties.
 */
export interface CredentialOutput {
	name: string;
	profileName: string;
	properties: CredentialProperties;
	resources: CredentialOutput[];
}

/**
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
	requestedUserName?: string,
): { username: string; password: string }[] {
	const creds: { username: string; password: string }[] = [];
	const loginTenants =
		odspEndpointName === "odsp"
			? process.env.login__odsp__test__tenants
			: process.env.login__odspdf__test__tenants;
	/**
	 * For the expected format of loginTenants, see {@link CredentialOutput}
	 */
	if (loginTenants !== undefined) {
		const output: CredentialOutput = JSON.parse(loginTenants);
		if (output.resources[tenantIndex] === undefined) {
			throw new Error("No resources found in the login tenants");
		}

		// Return the set of accounts to choose from a single tenant
		for (const account of output.resources[tenantIndex].resources) {
			const username = account.name;
			const password = account.properties.Password;
			if (requestedUserName === undefined || requestedUserName === username) {
				creds.push({ username, password });
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

		// ***** USE ONLY IF CHANGING TENANT FORMAT IN STRESSTESTS.TS *****
		// const output: CredentialOutput = JSON.parse(loginAccounts);
		// if (output.resources[0]?.resources[0] === undefined) {
		// 	throw new Error("No resources found in the login tenants");
		// }
		// const username = requestedUserName ?? output.resources[0].resources[0].name;
		// if (username === undefined) {
		// 	throw new Error("username should not be undefined when getting odsp credentials");
		// }
		// const password = output.resources[0].resources[0].properties.Password;
		// if (password === undefined) {
		// 	throw new Error("password should not be undefined when getting odsp credentials");
		// }
		// creds.push({ username, password });

		// Expected format of login__odsp__test__accounts is simply string key-value pairs of username and password
		const passwords: { [user: string]: string } = JSON.parse(loginAccounts);

		// Need to choose one out of the set as these account might be from different tenant
		const username = requestedUserName ?? Object.keys(passwords)[0];
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
	return creds;
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
		const siteUrl = tokenConfig.siteUrl;
		try {
			return await getDriveId(siteUrl, "", undefined, {
				accessToken: await this.getStorageToken({ siteUrl, refresh: false }, tokenConfig),
				refreshTokenFn: async () =>
					this.getStorageToken({ siteUrl, refresh: true }, tokenConfig),
			});
		} catch (ex) {
			if (tokenConfig.supportsBrowserAuth !== true) {
				throw ex;
			}
		}
		return getDriveId(siteUrl, "", undefined, {
			accessToken: await this.getStorageToken(
				{ siteUrl, refresh: false, useBrowserAuth: true },
				tokenConfig,
			),
			refreshTokenFn: async () =>
				this.getStorageToken({ siteUrl, refresh: true, useBrowserAuth: true }, tokenConfig),
		});
	}

	public static async createFromEnv(
		config?: {
			directory?: string;
			username?: string;
			options?: HostStoragePolicy;
			supportsBrowserAuth?: boolean;
			tenantIndex?: number;
			odspEndpointName?: string;
		},
		api: OdspDriverApiType = OdspDriverApi,
	) {
		const tenantIndex = config?.tenantIndex ?? 0;
		assertOdspEndpoint(config?.odspEndpointName);
		const endpointName = config?.odspEndpointName ?? "odsp";
		const creds = getOdspCredentials(endpointName, tenantIndex, config?.username);
		// Pick a random one on the list (only supported for >= 0.46)
		const randomUserIndex =
			compare(api.version, "0.46.0") >= 0
				? Math.random()
				: OdspTestDriver.legacyDriverUserRandomIndex;
		const userIndex = Math.floor(randomUserIndex * creds.length);
		// Bounds check above guarantees non-null (at least at compile time, assuming all types are respected)
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const { username, password } = creds[userIndex]!;

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

		return this.create(
			{
				username,
				password,
				siteUrl,
				supportsBrowserAuth: config?.supportsBrowserAuth,
			},
			config?.directory ?? "",
			api,
			options,
			tenantName,
			userIndex,
			endpointName,
		);
	}

	private static async getDriveId(siteUrl: string, tokenConfig: TokenConfig) {
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
	) {
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
		options: OdspResourceTokenFetchOptions & { useBrowserAuth?: boolean },
		config: IOdspTestLoginInfo & IPublicClientConfig,
	) {
		const host = new URL(options.siteUrl).host;

		if (options.useBrowserAuth === true) {
			const browserTokens = await this.odspTokenManager.getOdspTokens(
				host,
				config,
				{
					type: "browserLogin",
					navigator: (openUrl) => {
						console.log(
							`Open the following url in a new private browser window, and login with user: ${config.username}`,
						);
						console.log(
							`Additional account details may be available in the environment variable login__odsp__test__accounts`,
						);
						console.log(`"${openUrl}"`);
					},
				},
				options.refresh,
			);
			return browserTokens.accessToken;
		}
		// This function can handle token request for any multiple sites.
		// Where the test driver is for a specific site.
		const tokens = await this.odspTokenManager.getOdspTokens(
			host,
			config,
			passwordTokenConfig(config.username, config.password),
			options.refresh,
		);
		return tokens.accessToken;
	}

	public readonly type = "odsp";
	public get version() {
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

	public setPersistedCache(cache: IPersistedCache) {
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

	private async getStorageToken(options: OdspResourceTokenFetchOptions) {
		return OdspTestDriver.getStorageToken(options, this.config);
	}

	private async getPushToken(options: OdspResourceTokenFetchOptions) {
		const tokens = await OdspTestDriver.odspTokenManager.getPushTokens(
			new URL(options.siteUrl).host,
			this.config,
			passwordTokenConfig(this.config.username, this.config.password),
			options.refresh,
		);

		return tokens.accessToken;
	}

	public getUrlFromItemId(itemId: string) {
		return this.api.createOdspUrl({
			siteUrl: this.config.siteUrl,
			driveId: this.config.driveId,
			itemId,
			dataStorePath: "/",
		});
	}
}
