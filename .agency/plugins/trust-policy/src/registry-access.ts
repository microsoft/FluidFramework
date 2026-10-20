/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Public registries that some corporate networks block.
 */
export const publicRegistries = [
	"https://registry.npmjs.org",
	"https://registry.yarnpkg.com",
	"https://registry.npmmirror.com",
] as const;

export interface RegistryAccess {
	registry: string;
	reachable: boolean;
	/**
	 * HTTP status or network error code observed by the probe.
	 */
	detail: string;
}

/**
 * Pings each registry concurrently. Any network error or non-2xx response counts as blocked.
 * @param registries - Registry origins to probe.
 * @param fetcher - Fetch implementation.
 * @param timeoutMs - Per-registry timeout.
 */
export async function probeRegistries(
	registries: readonly string[],
	fetcher: typeof fetch = fetch,
	timeoutMs = 5000,
): Promise<RegistryAccess[]> {
	return Promise.all(
		registries.map(async (registry): Promise<RegistryAccess> => {
			try {
				const response = await fetcher(`${registry}/-/ping`, {
					redirect: "manual",
					signal: AbortSignal.timeout(timeoutMs),
				});
				await response.body?.cancel();
				return { registry, reachable: response.ok, detail: `HTTP ${response.status}` };
			} catch (error) {
				return { registry, reachable: false, detail: describeNetworkError(error) };
			}
		}),
	);
}

function describeNetworkError(error: unknown): string {
	if (!(error instanceof Error)) return String(error);
	if (error.name === "TimeoutError") return "timed out";
	// Node's fetch reports DNS, connection, and TLS failures on the cause.
	const cause: unknown = error.cause;
	if (cause instanceof Error && "code" in cause && typeof cause.code === "string")
		return cause.code;
	return error.message;
}

/**
 * Returns the probe result for a blocked public registry with the same origin, if any.
 * @param registry - Registry URL the command will use.
 * @param access - Probe results.
 */
export function findBlockedRegistry(
	registry: string,
	access: readonly RegistryAccess[],
): RegistryAccess | undefined {
	let origin: string;
	try {
		origin = new URL(registry).origin;
	} catch {
		return undefined;
	}
	return access.find((entry) => !entry.reachable && new URL(entry.registry).origin === origin);
}

/**
 * Formats probe results as aligned text lines.
 * @param access - Probe results.
 */
export function formatRegistryAccess(access: readonly RegistryAccess[]): string[] {
	const width = Math.max(...access.map(({ registry }) => registry.length));
	return access.map(
		({ registry, reachable, detail }) =>
			`  ${registry.padEnd(width)}  ${reachable ? "reachable" : "BLOCKED"} (${detail})`,
	);
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
		if (url.username === "" && url.password === "") return registry;
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
		if (typeof value !== "string") continue;
		if (key === "registry") {
			registry = value;
			continue;
		}
		const scope = /^(@[^:/]+):registry$/.exec(key)?.[1];
		if (scope !== undefined) scoped.set(scope, value);
	}
	return { registry, scoped };
}
