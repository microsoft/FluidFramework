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

/**
 * Dynamically import the test tenant checkout client from the provided package location.
 *
 * @param packageImportLocation - Resolved value of the `token__package__import__location` environment variable.
 * The caller is responsible for reading and validating this from the environment (see {@link resolveOdspEnvironment}).
 * An internal package checks out test tenants, populates user information in the environment, and makes an entrypoint
 * available at this location which supports fetching tokens for those users.
 */
export async function getTestTenantCheckoutClient(
	packageImportLocation: string,
): Promise<TestTenantCheckoutClient> {
	if (testTenantCheckoutClientCached !== undefined) {
		return testTenantCheckoutClientCached;
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
 * Resolved and validated values from the environment variables required for the FIC credential flow.
 * @internal
 */
export interface OdspEnvironment {
	/**
	 * Validated list of usernames from `login__odsp__fic__test__users`.
	 */
	usernames: string[];
	/**
	 * Validated value of `token__package__import__location`: the import location of the package
	 * that provides the {@link TestTenantCheckoutClient}.
	 */
	packageImportLocation: string;
}

/**
 * Read and validate all environment variables required for the FIC credential flow.
 *
 * Centralizing environment access here lets us fail fast (e.g. at server startup, before a token is ever
 * requested) and produce concrete, strongly-typed values to pass through the rest of the flow rather than
 * letting downstream functions reach into the global environment.
 * @internal
 */
export function resolveOdspEnvironment(): OdspEnvironment {
	const ficAccounts = process.env.login__odsp__fic__test__users;
	if (ficAccounts === undefined) {
		throw new Error(
			"login__odsp__fic__test__users is not defined. Run the @ff-internal/tenant-setup script to populate this environment variable.",
		);
	}

	const packageImportLocation = process.env.token__package__import__location;
	if (packageImportLocation === undefined) {
		throw new Error(
			"The FIC credential flow relies on a test tenant checkout client, but token__package__import__location is not defined. Run the @ff-internal/tenant-setup script to populate this environment variable.",
		);
	}

	const usernames = parseUsernames(ficAccounts);
	if (usernames.length === 0) {
		throw new Error(
			"login__odsp__fic__test__users was defined but does not have any valid usernames. Run the @ff-internal/tenant-setup script to populate this environment variable.",
		);
	}

	return { usernames, packageImportLocation };
}

/**
 * Parse and validate the JSON contents of the `login__odsp__fic__test__users` environment variable.
 * Performs a runtime type-check rather than an unchecked cast so that malformed values fail with a clear error.
 */
function parseUsernames(ficAccounts: string): string[] {
	const parsed: unknown = JSON.parse(ficAccounts);
	if (
		typeof parsed !== "object" ||
		parsed === null ||
		!("usernames" in parsed) ||
		!Array.isArray(parsed.usernames) ||
		!parsed.usernames.every((username): username is string => typeof username === "string")
	) {
		throw new Error(
			"login__odsp__fic__test__users must be a JSON object with a 'usernames' array of strings. Run the @ff-internal/tenant-setup script to populate this environment variable.",
		);
	}
	return parsed.usernames;
}

/**
 * Build a set of credentials to use from a single tenant.
 *
 * @param usernames - Validated usernames resolved from the environment (see {@link resolveOdspEnvironment}).
 * @param packageImportLocation - Validated import location of the test tenant checkout client.
 * @internal
 */
export function getOdspCredentials(
	odspEndpointName: OdspEndpoint,
	usernames: string[],
	packageImportLocation: string,
): LoginCredentials[] {
	return usernames.map((username) =>
		getFicLoginCredentials(username, odspEndpointName, packageImportLocation),
	);
}

const getFicLoginCredentials = (
	username: string,
	odspEndpointName: OdspEndpoint,
	packageImportLocation: string,
): LoginCredentials => {
	const fetchToken = async (scopeEndpoint: "storage" | "push"): Promise<string> => {
		const testTenantCheckoutClient = await getTestTenantCheckoutClient(packageImportLocation);
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
