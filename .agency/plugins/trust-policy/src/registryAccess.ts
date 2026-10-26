/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A network endpoint that a command uses, and how to test whether it is reachable.
 *
 * @remarks
 * Probes are diagnostic only.
 * A registry can serve package metadata while rejecting its probe path, and Sigstore verification can use cached TUF metadata when the repository is unreachable, so an unreachable probe does not establish that the command will fail.
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
 */
export function npmRegistryEndpoint(registry: string, purpose: string): Endpoint {
	return { url: normalizeEndpointUrl(registry), probePath: "/-/ping", purpose };
}

/**
 * Sigstore's public-good TUF repository, from which sigstore-js refreshes the trusted root used for cryptographic verification.
 * TUF clients fetch `timestamp.json` on every refresh.
 * @param purpose - What the command uses the trusted root for.
 */
export function sigstoreTufEndpoint(purpose: string): Endpoint {
	return {
		url: "https://tuf-repo-cdn.sigstore.dev",
		probePath: "/timestamp.json",
		purpose,
	};
}

/**
 * Probes each endpoint concurrently. Any network error or non-2xx response counts as unreachable.
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
 * Describes the unreachable endpoints in probe results, if any, as a warning that does not stop the command.
 * @param access - Probe results.
 * @returns The warning, or `undefined` if every endpoint is reachable.
 */
export function describeUnreachableEndpoints(
	access: readonly EndpointAccess[],
): string | undefined {
	const unreachable = access.filter(({ reachable }) => !reachable);
	if (unreachable.length === 0) {
		return undefined;
	}
	return `WARNING: ${unreachable.map(({ url, detail }) => `${url} did not respond to its probe (${detail})`).join("; ")}. Continuing; if the check is inconclusive, pass --registry with a reachable HTTPS registry that serves npm attestations, or check access to Sigstore.`;
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
	return `${reachable ? "reachable" : "UNREACHABLE"} (${detail})`;
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
