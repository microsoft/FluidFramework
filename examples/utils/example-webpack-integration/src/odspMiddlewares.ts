/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-nodejs-modules
import process from "node:process";

// eslint-disable-next-line import/no-internal-modules
import { OdspTokenManager } from "@fluidframework/tool-utils/internal";

/**
 * Construct the set of middleware required to support the odsp example driver.
 *
 * @remarks
 * Relies on environment variables containing the test tenant and user information, which will be
 * automatically configured by running trips-setup.
 *
 * process.env.login__odsp__test__tenants - JSON array of users/credentials with deducible tenants
 * process.env.login__microsoft__clientId - the client ID to use
 *
 * @internal
 */
export const getOdspMiddlewares = () => {
	if (process.env.login__odsp__test__tenants === undefined) {
		throw new Error(
			"process.env.login__odsp__test__tenants is missing. Make sure you ran trips-setup and restarted your terminal.",
		);
	}
	if (process.env.login__microsoft__clientId === undefined) {
		throw new Error(
			"process.env.login__microsoft__clientId is missing. Make sure you ran trips-setup and restarted your terminal.",
		);
	}
	const testAccounts = JSON.parse(process.env.login__odsp__test__tenants);
	const { UserPrincipalName: username, Password: password } = testAccounts[0];
	const emailServer = username.substring(username.indexOf("@") + 1);
	const tenantName = emailServer.substring(0, emailServer.indexOf("."));
	const siteUrl = `https://${tenantName}.sharepoint.com`;
	const server = new URL(siteUrl).host;

	const clientId = process.env.login__microsoft__clientId;

	const tokenManager = new OdspTokenManager();
	let storageToken: string;
	let pushToken: string;

	return [
		{
			name: "get-site-url",
			path: "/siteUrl",
			middleware: async (req, res) => {
				res.send(siteUrl);
			},
		},
		{
			name: "get-storage-token",
			path: "/storageToken",
			middleware: async (req, res) => {
				try {
					storageToken ??= (
						await tokenManager.getOdspTokens(
							server,
							{ clientId },
							{
								type: "password",
								username,
								password,
							},
						)
					).accessToken;
					res.send(storageToken);
				} catch (error) {
					res.status(500).send((error as Error).message);
				}
			},
		},
		{
			name: "get-push-token",
			path: "/pushToken",
			middleware: async (req, res) => {
				try {
					pushToken ??= (
						await tokenManager.getPushTokens(
							server,
							{ clientId },
							{
								type: "password",
								username,
								password,
							},
						)
					).accessToken;
					res.send(pushToken);
				} catch (error) {
					res.status(500).send((error as Error).message);
				}
			},
		},
	];
};
