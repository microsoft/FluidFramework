/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Public npm registries that some corporate networks block.
 */
export const publicRegistries = [
	"https://registry.npmjs.org",
	"https://registry.yarnpkg.com",
	"https://registry.npmmirror.com",
] as const;

/**
 * A network endpoint that a command uses, and how to test whether it is reachable.
 */
export interface Endpoint {
	/**
	 * Base URL, without a trailing slash or credentials.
	 */
	url: string;
	/**
	 * Path appended to {@link Endpoint.url} to test reachability.
	 */
	probePath: string;
	/**
	 * What the command uses the endpoint for.
	 */
	purpose: string;
	/**
	 * Whether the command stops when the endpoint is unreachable.
	 * Optional endpoints are reported, and failures that depend on them become inconclusive results.
	 */
	required: boolean;
}

/**
 * Reachability of an {@link Endpoint}.
 */
export interface EndpointAccess extends Endpoint {
	/**
	 * Whether the probe received a 2xx response.
	 */
	reachable: boolean;
	/**
	 * HTTP status or network error code observed by the probe.
	 */
	detail: string;
}

/**
 * Describes an npm registry endpoint, probed with npm's `/-/ping` endpoint.
 * @param registry - Registry URL. Credentials are removed.
 * @param purpose - What the command uses the registry for.
 * @param required - Whether the command stops when the registry is unreachable.
 */
export function npmRegistryEndpoint(
	registry: string,
	purpose: string,
	required = true,
): Endpoint {
	return { url: normalizeEndpointUrl(registry), probePath: "/-/ping", purpose, required };
}

/**
 * Sigstore's public-good TUF repository, from which sigstore-js refreshes the trusted root used for cryptographic verification.
 * TUF clients fetch `timestamp.json` on every refresh.
 * @param purpose - What the command uses the trusted root for.
 * @param required - Whether the command stops when the repository is unreachable.
 */
export function sigstoreTufEndpoint(purpose: string, required: boolean): Endpoint {
	return {
		url: "https://tuf-repo-cdn.sigstore.dev",
		probePath: "/timestamp.json",
		purpose,
		required,
	};
}

/**
 * Lists the endpoints a command needs, followed by the public registries that it does not need, which are probed for information only.
 * @param needed - Endpoints the command uses.
 */
export function planEndpoints(needed: readonly Endpoint[]): Endpoint[] {
	const urls = new Set(needed.map(({ url }) => url));
	return [
		...needed,
		...publicRegistries
			.filter((registry) => !urls.has(registry))
			.map((registry) => npmRegistryEndpoint(registry, "not used (informational)", false)),
	];
}

/**
 * Probes each endpoint concurrently. Any network error or non-2xx response counts as blocked.
 * @param endpoints - Endpoints to probe.
 * @param fetcher - Fetch implementation.
 * @param timeoutMs - Per-endpoint timeout.
 */
export async function probeEndpoints(
	endpoints: readonly Endpoint[],
	fetcher: typeof fetch = fetch,
	timeoutMs = 5000,
): Promise<EndpointAccess[]> {
	return Promise.all(
		endpoints.map(async (endpoint): Promise<EndpointAccess> => {
			try {
				const response = await fetcher(`${endpoint.url}${endpoint.probePath}`, {
					redirect: "manual",
					signal: AbortSignal.timeout(timeoutMs),
				});
				await response.body?.cancel();
				return { ...endpoint, reachable: response.ok, detail: `HTTP ${response.status}` };
			} catch (error) {
				return { ...endpoint, reachable: false, detail: describeNetworkError(error) };
			}
		}),
	);
}

/**
 * Returns the required endpoints that are unreachable.
 * @param access - Probe results.
 */
export function findBlockedEndpoints(access: readonly EndpointAccess[]): EndpointAccess[] {
	return access.filter(({ required, reachable }) => required && !reachable);
}

/**
 * Formats probe results as aligned text lines.
 * @param access - Probe results.
 */
export function formatEndpointAccess(access: readonly EndpointAccess[]): string[] {
	const width = Math.max(...access.map(({ url }) => url.length));
	const statusWidth = Math.max(...access.map((entry) => formatStatus(entry).length));
	return access.map(
		(entry) =>
			`  ${entry.url.padEnd(width)}  ${formatStatus(entry).padEnd(statusWidth)}  ${entry.purpose}`,
	);
}

function formatStatus({ reachable, detail }: EndpointAccess): string {
	return `${reachable ? "reachable" : "BLOCKED"} (${detail})`;
}

/**
 * Normalizes an endpoint URL for display, probing, and comparison by removing credentials, query, fragment, and trailing slashes.
 * @param url - Endpoint URL.
 */
export function normalizeEndpointUrl(url: string): string {
	const parsed = new URL(url);
	parsed.username = "";
	parsed.password = "";
	parsed.search = "";
	parsed.hash = "";
	return parsed.href.replace(/\/+$/, "");
}

function describeNetworkError(error: unknown): string {
	if (!(error instanceof Error)) {
		return String(error);
	}
	if (error.name === "TimeoutError") {
		return "timed out";
	}
	// Node's fetch reports DNS, connection, and TLS failures on the cause.
	const cause: unknown = error.cause;
	if (cause instanceof Error && "code" in cause && typeof cause.code === "string") {
		return cause.code;
	}
	return error.message;
}

export const azureArtifactsReason =
	"Azure Artifacts feeds do not serve npm provenance attestations or trusted-publisher metadata, so every package resolved through them appears unattested.";

/**
 * Returns whether a registry URL is an Azure Artifacts (or Azure DevOps Server) npm feed.
 * @param registry - Registry URL.
 */
export function isAzureArtifactsRegistry(registry: string): boolean {
	let url: URL;
	try {
		url = new URL(registry);
	} catch {
		return false;
	}
	const host = url.hostname.toLowerCase();
	return (
		host === "pkgs.dev.azure.com" ||
		host.endsWith(".pkgs.visualstudio.com") ||
		/\/_packaging\//i.test(url.pathname)
	);
}

/**
 * Removes any credentials embedded in a registry URL so it can be shown to the user.
 * @param registry - Registry URL.
 */
export function redactRegistry(registry: string): string {
	try {
		const url = new URL(registry);
		if (url.username === "" && url.password === "") {
			return registry;
		}
		url.username = "";
		url.password = "";
		return url.href;
	} catch {
		return "<unparseable registry URL>";
	}
}

export interface RegistryConfig {
	registry: string | undefined;
	/**
	 * Registries configured for individual scopes, keyed by scope (for example `@contoso`).
	 */
	scoped: Map<string, string>;
}

/**
 * Extracts default and scoped registries from `pnpm config list --json`.
 * The output also contains credentials, so it must never be logged or echoed in errors.
 * @param configListJson - Output of `pnpm config list --json`.
 */
export function parseRegistryConfig(configListJson: string): RegistryConfig {
	let data: unknown;
	try {
		data = JSON.parse(configListJson);
	} catch {
		throw new Error("pnpm config list did not return JSON.");
	}
	if (typeof data !== "object" || data === null || Array.isArray(data)) {
		throw new Error("pnpm config list did not return a JSON object.");
	}
	let registry: string | undefined;
	const scoped = new Map<string, string>();
	for (const [key, value] of Object.entries(data)) {
		if (typeof value !== "string") {
			continue;
		}
		if (key === "registry") {
			registry = value;
			continue;
		}
		const scope = /^(@[^:/]+):registry$/.exec(key)?.[1];
		if (scope !== undefined) {
			scoped.set(scope, value);
		}
	}
	return { registry, scoped };
}
