/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Types of Odsp endpoints.
 * @internal
 */
export type OdspEndpoint = "odsp" | "odsp-df";

/**
 * Credentials containing a username and bearer token for FIC authentication scenarios.
 */
interface TokenCredentials {
	UserPrincipalName: string;
	Token: string;
}

/**
 * @internal
 */
export interface LoginCredentials {
	type: "fic";
	username: string;
	fetchToken(scopeEndpoint: "push" | "storage"): Promise<string>;
}

/**
 * Expected API for the package located at the contents of the environment variable `token__package__import__location`.
 *
 * This package is expected to be able to provide tokens associated with test users.
 */
export interface TestTenantCheckoutClient {
	fetchFicTokens(
		usernames: string[],
		tokenScope: "push" | "storage",
		odspEndpointName: OdspEndpoint,
	): Promise<TokenCredentials[]>;
}

let testTenantCheckoutClientCached: TestTenantCheckoutClient | undefined;

export async function getTestTenantCheckoutClient(): Promise<TestTenantCheckoutClient> {
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
			`Expected package at '${packageImportLocation}' to export fetchFicTokens. Run the @ff-internal/tenant-setup script to populate this environment variable.`,
		);
	}
	// eslint-disable-next-line require-atomic-updates
	testTenantCheckoutClientCached = pkg;
	return pkg;
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
