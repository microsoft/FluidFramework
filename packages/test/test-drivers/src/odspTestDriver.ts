/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
import { OdspPointInTimeDocumentServiceFactory } from "@fluidframework/odsp-driver/internal";
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

const getFicLoginCredentials = (
	username: string,
	odspEndpointName: OdspEndpoint,
): LoginCredentials => {
	const fetchToken = async (scopeEndpoint: "storage" | "push"): Promise<string> => {
		const testTenantCheckoutClient = await getTestTenantCheckoutClient();
		const tokens = await testTenantCheckoutClient.fetchFicTokens(
			[username],
			scopeEndpoint,
			odspEndpointName,
		);
		if (!Array.isArray(tokens)) {
			// This error indicates a mismatch between the dynamically imported token fetcher package and this code.
			// Double-check that the package specified in 'token__package__import__location' is up to date and its entrypoint
			// matches the typing of `fetchFicTokens` as defined in `TestTenantCheckoutClient`.
			throw new TypeError(
				"Expected fetchFicTokens to return an array of tokens. Run the @ff-internal/tenant-setup script to populate this environment variable.",
			);
		}
		const token = tokens.find((a) => a.UserPrincipalName === username);
		if (!token) {
			throw new Error(
				`Unable to fetch token for user '${username}' and scope '${scopeEndpoint}'. Run the @ff-internal/tenant-setup script with the correct endpoint for the desired environment.`,
			);
		}
		return token.Token;
	};

	return {
		type: "fic",
		username,
		fetchToken,
	};
};

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

/**
 * Credentials containing a username and bearer token for FIC authentication scenarios.
 */
interface TokenCredentials {
	UserPrincipalName: string;
	Token: string;
}

/**
 * Expected API for the package located at the contents of the environment variable `token__package__import__location`.
 *
 * This package is expected to be able to provide tokens associated with test users.
 */
interface TestTenantCheckoutClient {
	fetchFicTokens(
		usernames: string[],
		tokenScope: "push" | "storage",
		odspEndpointName: OdspEndpoint,
	): Promise<TokenCredentials[]>;
}

let testTenantCheckoutClientCached: TestTenantCheckoutClient | undefined;

async function getTestTenantCheckoutClient(): Promise<TestTenantCheckoutClient> {
	if (testTenantCheckoutClientCached !== undefined) {
		return testTenantCheckoutClientCached;
	}
	// An internal package checks out test tenants, populates user information in the environment, and makes an entrypoint available
	// at this location (token__package__import__location) which supports fetching tokens for those users.
	const packageImportLocation = process.env.token__package__import__location;
	if (packageImportLocation === undefined) {
		throw new Error(
			"The FIC credential flow relies on a test tenant checkout client, but no client was found. Populate this environment variable by running the @ff-internal/tenant-setup script.",
		);
	}

	const pkg = (await import(packageImportLocation)) as TestTenantCheckoutClient;
	if (typeof pkg.fetchFicTokens !== "function") {
		throw new TypeError(
			`Expected package at '${packageImportLocation}' to export the token fetching function. Run the @ff-internal/tenant-setup script to populate this environment variable.`,
		);
	}
	testTenantCheckoutClientCached = pkg;
	return pkg;
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
	throw new TypeError("Not an odsp endpoint");
}

/**
 * Get from the env a set of credentials to use from a single tenant.
 *
 * Credentials may be provided via a variety of methods. This function does not attempt to aggregate them, but instead loads only those credentials
 * it finds evidence (i.e. defined environment variables) for, with precedence given to more modern approaches.
 * @param tenantIndex - integer to choose the tenant from array of options (if multiple tenants are available)
 * @internal
 */
export function getOdspCredentials(
	odspEndpointName: OdspEndpoint,
	tenantIndex: number,
): LoginCredentials[] {
	const ficAccounts = process.env.login__odsp__fic__test__users;
	if (ficAccounts === undefined) {
		throw new Error(
			"login__odsp__fic__test__users is not defined. Run the @ff-internal/tenant-setup script to populate this environment variable.",
		);
	}
	const { usernames } = JSON.parse(ficAccounts) as {
		usernames: string[];
	};

	if (usernames.length === 0) {
		throw new Error(
			"login__odsp__fic__test__users was defined but does not have any valid usernames. Run the @ff-internal/tenant-setup script to populate this environment variable.",
		);
	}
	return usernames.map((username) => getFicLoginCredentials(username, odspEndpointName));
}

// Default token manager — shared across all OdspTestDriver instances that don't supply their own.
// Uses file-based cache to persist refresh tokens across runs.
// Callers that need memory-only caching (e.g. stress tests running many child processes
// simultaneously) can supply their own OdspTokenManager via createFromEnv's tokenManager option.
const defaultTokenManager = new OdspTokenManager(odspTokensCache);

/**
 * @internal
 */
export class OdspTestDriver implements ITestDriver {
	// Share the driveId across multiple instances of the test driver.
	private static readonly driveIdPCache = new Map<string, Promise<string>>();
	// Choose a single random user up front for legacy driver which doesn't support isolateSocketCache
	private static readonly legacyDriverUserRandomIndex = Math.random();

	private static async getDriveIdFromConfig(
		tokenConfig: TokenConfig,
		tokenManager: OdspTokenManager,
	): Promise<string> {
		const { siteUrl } = tokenConfig;
		return getDriveId(siteUrl, "", undefined, {
			accessToken: await this.getStorageToken(
				{ siteUrl, refresh: false },
				tokenConfig,
				tokenManager,
			),
			refreshTokenFn: async () =>
				this.getStorageToken({ siteUrl, refresh: true }, tokenConfig, tokenManager),
		});
	}

	public static async createFromEnv(
		config?: {
			directory?: string;
			username?: string;
			options?: HostStoragePolicy;
			tenantIndex?: number;
			odspEndpointName?: string;
			tokenManager?: OdspTokenManager;
		},
		api: OdspDriverApiType = OdspDriverApi,
	): Promise<OdspTestDriver> {
		const tenantIndex = config?.tenantIndex ?? 0;
		assertOdspEndpoint(config?.odspEndpointName);
		const endpointName = config?.odspEndpointName ?? "odsp";

		// Pick a random one on the list (only supported for >= 0.46)
		const randomUserIndex =
			compare(api.version, "0.46.0") >= 0
				? Math.random()
				: OdspTestDriver.legacyDriverUserRandomIndex;

		let allCredentials = getOdspCredentials(endpointName, tenantIndex);
		if (config?.username !== undefined) {
			// If config requested a specific username, only use that.
			allCredentials = allCredentials.filter((c) => c.username === config.username);
		}

		if (allCredentials.length === 0) {
			throw new Error(
				config?.username !== undefined
					? `No credentials available for requested username '${config.username}'.`
					: "No credentials available for the specified endpoint and tenant.",
			);
		}
		const userIndex = Math.floor(randomUserIndex * allCredentials.length);
		// Bounds check above guarantees non-null (at least at compile time, assuming all types are respected)
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const credentials = allCredentials[userIndex]!;

		const { username } = credentials;
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
			{ siteUrl, credentials },
			config?.directory ?? "",
			api,
			options,
			tenantName,
			userIndex,
			endpointName,
			config?.tokenManager,
		);
	}

	private static async getDriveId(
		siteUrl: string,
		tokenConfig: TokenConfig,
		tokenManager: OdspTokenManager,
	): Promise<string> {
		let driveIdP = this.driveIdPCache.get(siteUrl);
		if (driveIdP) {
			return driveIdP;
		}

		driveIdP = this.getDriveIdFromConfig(tokenConfig, tokenManager);
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
		tokenManager: OdspTokenManager = defaultTokenManager,
	): Promise<OdspTestDriver> {
		const tokenConfig: TokenConfig = {
			...loginInfo,
			...getMicrosoftConfiguration(),
		};

		const driveId = await this.getDriveId(loginInfo.siteUrl, tokenConfig, tokenManager);
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

		return new OdspTestDriver(
			driverConfig,
			api,
			tenantName,
			userIndex,
			endpointName,
			tokenManager,
		);
	}

	private static async getStorageToken(
		options: OdspResourceTokenFetchOptions,
		config: TokenConfig,
		tokenManager: OdspTokenManager,
	): Promise<string> {
		const tokens = await tokenManager.getOdspTokens(config.credentials, options.refresh);
		return tokens.accessToken;
	}

	public readonly type = "odsp";
	public readonly endpointName?: string;
	public readonly tenantName?: string;
	public readonly userIndex?: number;
	public get version(): string {
		return this.api.version;
	}
	private readonly testIdToUrl = new Map<string, string>();
	private cache?: IPersistedCache;
	private constructor(
		private readonly config: Readonly<IOdspTestDriverConfig>,
		private readonly api = OdspDriverApi,
		tenantName?: string,
		userIndex?: number,
		endpointName?: string,
		private readonly tokenManager: OdspTokenManager = defaultTokenManager,
	) {
		if (endpointName !== undefined) {
			this.endpointName = endpointName;
		}
		if (tenantName !== undefined) {
			this.tenantName = tenantName;
		}
		if (userIndex !== undefined) {
			this.userIndex = userIndex;
		}
	}

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
		delete this.cache;
		return documentServiceFactory;
	}

	/**
	 * Creates an `OdspPointInTimeDocumentServiceFactory` wired to this driver's tokens.
	 *
	 * @remarks
	 * Point-in-time loading (`loadContainerToSequenceNumber`) requires a factory that can materialize
	 * the document at a target sequence number. Unlike `createDocumentServiceFactory`, this is
	 * imported directly from the current `@fluidframework/odsp-driver` rather than through the
	 * versioned driver api, so it is only appropriate for `NoCompat` tests.
	 */
	createPointInTimeDocumentServiceFactory(): OdspPointInTimeDocumentServiceFactory {
		const documentServiceFactory = new OdspPointInTimeDocumentServiceFactory(
			this.getStorageToken.bind(this),
			this.getPushToken.bind(this),
			this.cache,
			this.config.options,
		);
		// Automatically reset the cache after creating the factory
		delete this.cache;
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
		return OdspTestDriver.getStorageToken(options, this.config, this.tokenManager);
	}

	private async getPushToken(options: OdspResourceTokenFetchOptions): Promise<string> {
		const tokens = await this.tokenManager.getPushTokens(
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

	/**
	 * Fetches a storage-scoped access token for the given ODSP resource.
	 *
	 * @remarks
	 * Exposed for test infrastructure that needs to make raw ODSP REST calls outside the driver
	 * (e.g. point-in-time version setup: listing, restoring, and snapping file versions). The
	 * returned value is the raw access token, not an `Authorization` header value.
	 */
	public async getStorageTokenForResource(
		options: OdspResourceTokenFetchOptions,
	): Promise<string> {
		return this.getStorageToken(options);
	}
}
