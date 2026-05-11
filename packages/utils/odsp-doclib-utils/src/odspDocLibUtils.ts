/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const odspTenants = new Map<string, string>([
	["spo", "microsoft-my.sharepoint.com"],
	["spo-df", "microsoft-my.sharepoint-df.com"],
]);

// eslint-disable-next-line jsdoc/require-description -- TODO: Add documentation
/**
 * @internal
 */
export function isOdspHostname(server: string): boolean {
	return server.endsWith("sharepoint.com") || server.endsWith("sharepoint-df.com");
}

// eslint-disable-next-line jsdoc/require-description -- TODO: Add documentation
/**
 * @internal
 */
export function isPushChannelHostname(server: string): boolean {
	return server.includes(".push") && server.endsWith(".svc.ms");
}

// eslint-disable-next-line jsdoc/require-description -- TODO: Add documentation
/**
 * @internal
 */
export function getAadUrl(server: string): string {
	// special case for local / pushchannel testing
	if (server === "localhost" || server.startsWith("localhost:")) {
		// localhost will not be https
		return `http://${server}`;
	}

	if (isPushChannelHostname(server)) {
		// if the SPO url is pushchannel, use the pushchannel AAD mock
		return getSiteUrl(server);
	}

	return `https://login.microsoftonline.com`;
}

// eslint-disable-next-line jsdoc/require-description -- TODO: Add documentation
/**
 * @internal
 */
export function getAadTenant(server: string): string {
	let hostname = server;

	if (hostname.startsWith("http://")) {
		hostname = hostname.slice(7);
	} else if (hostname.startsWith("https://")) {
		hostname = hostname.slice(8);
	}

	let tenantName = hostname.slice(0, Math.max(0, hostname.indexOf("."))).toLowerCase();
	let restOfTenantHostname = hostname.slice(tenantName.length).toLowerCase();

	if (tenantName.endsWith("-my")) {
		tenantName = tenantName.slice(0, Math.max(0, tenantName.length - 3));
	} else if (tenantName.endsWith("-admin")) {
		tenantName = tenantName.slice(0, Math.max(0, tenantName.length - 6));
	}

	if (restOfTenantHostname.startsWith(".sharepoint.")) {
		restOfTenantHostname = `.onmicrosoft.${restOfTenantHostname.slice(12)}`;
	}
	if (restOfTenantHostname.startsWith(".sharepoint-df.")) {
		restOfTenantHostname = `.onmicrosoft.${restOfTenantHostname.slice(15)}`;
	}

	return `${tenantName}${restOfTenantHostname}`;
}

// eslint-disable-next-line jsdoc/require-description -- TODO: Add documentation
/**
 * @internal
 */
export function getServer(tenantId: string): string {
	const server = odspTenants.get(tenantId);
	if (!server) {
		throw new Error(`Invalid SPO tenantId ${tenantId}.`);
	}
	return server;
}

// eslint-disable-next-line jsdoc/require-description -- TODO: Add documentation
/**
 * @internal
 */
export function getSiteUrl(server: string): string {
	if (server.startsWith("http://") || server.startsWith("https://")) {
		// server is already a site url
		return server;
	}

	// server is likely {tenantId}.sharepoint.com. add https to make it the site url
	return `https://${server}`;
}
