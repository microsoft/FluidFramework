/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Default Tinylicious port.
 */
const defaultTinyliciousPort = 7070;

/**
 * Detects the appropriate Tinylicious endpoint based on the environment.
 * In GitHub Codespaces, returns the forwarded port URL. Otherwise returns localhost.
 * @remarks If using codespaces, set tinylicious (port 7070) visibility to "public" for this to work.
 *
 * @param port - The port number to use. Defaults to 7070.
 * @returns The Tinylicious endpoint URL.
 *
 * @internal
 */
export function getTinyliciousEndpoint(port = defaultTinyliciousPort): string {
	if (typeof window !== "undefined") {
		// Detect GitHub Codespaces and use the forwarded port URL
		// <codespace-name>-<forwarded-port>.<domain>
		// e.g. my-codespace-7070.githubpreview.dev
		// Capture Group 1: <codespace-name>
		// Capture Group 2: <domain>
		// reconstruct a hostname that forwards tinylicious's port via HTTPS.
		const match = /^(.+)-\d+\.(.+)$/.exec(window.location.hostname);
		if (match) {
			return `https://${match[1]}-${port}.${match[2]}`;
		}
	}
	return `http://localhost:${port}`;
}
