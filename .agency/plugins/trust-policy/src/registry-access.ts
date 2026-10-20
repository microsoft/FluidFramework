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
