/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-nodejs-modules
import process from "node:process";

// eslint-disable-next-line import/no-internal-modules
import { OdspTokenManager } from "@fluidframework/tool-utils/internal";
import type { Middleware, Request, Response } from "webpack-dev-server";

type TestAccounts = { UserPrincipalName: string; Password: string }[];
const isTestAccounts = (value: unknown): value is TestAccounts =>
	Array.isArray(value) &&
	value.every(
		(account) =>
			typeof account === "object" &&
			account !== null &&
			"UserPrincipalName" in account &&
			"Password" in account &&
			typeof (account as { UserPrincipalName: unknown }).UserPrincipalName === "string" &&
			typeof (account as { Password: unknown }).Password === "string",
	);

const parseTestAccounts = (
	stringAccounts: string,
): { username: string; password: string; siteUrl: string; server: string } => {
	const testAccounts: unknown = JSON.parse(stringAccounts);
	if (!isTestAccounts(testAccounts) || testAccounts[0] === undefined) {
		throw new Error(
			`stringAccounts did not parse to a valid array of test accounts: ${stringAccounts}`,
		);
	}
	const { UserPrincipalName: username, Password: password } = testAccounts[0];
	const atIndex = username.indexOf("@");
	if (atIndex === -1) {
		throw new Error(
			`UserPrincipalName "${username}" is not a valid email address (missing "@").`,
		);
	}
	const emailServer = username.slice(atIndex + 1);
	const dotIndex = emailServer.indexOf(".");
	if (dotIndex === -1) {
		throw new Error(
			`Couldn't find tenantName from emailServer: "${emailServer}". Expected a domain containing a dot ('.').`,
		);
	}
	const tenantName = emailServer.slice(0, dotIndex);
	const siteUrl = `https://${tenantName}.sharepoint.com`;
	const server = new URL(siteUrl).host;

	return { username, password, siteUrl, server };
};
/**
 * Construct the set of middleware required to support the odsp example driver.
 *
 * @remarks
 * Relies on environment variables containing the test tenant and user information, which will be
 * automatically configured by running trips-setup.
 *
 * process.env.login__odsp__test__tenants - JSON array of users/credentials with deducible tenants
 * process.env.login__microsoft__clientId - the client ID to use
 */
export const createOdspMiddlewares = (): Middleware[] => {
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

	const { username, password, siteUrl, server } = parseTestAccounts(
		process.env.login__odsp__test__tenants,
	);

	const clientId = process.env.login__microsoft__clientId;

	const tokenManager = new OdspTokenManager();
	// Cache fetch attempts to avoid multiple calls
	let storageTokenP: Promise<string>;
	let pushTokenP: Promise<string>;

	return [
		{
			name: "get-site-url",
			path: "/siteUrl",
			middleware: (req: Request, res: Response) => {
				res.send(siteUrl);
			},
		},
		{
			name: "get-storage-token",
			path: "/storageToken",
			middleware: (req: Request, res: Response) => {
				storageTokenP ??= tokenManager
					.getOdspTokens(
						server,
						{ clientId },
						{
							type: "password",
							username,
							password,
						},
					)
					.then((tokens) => tokens.accessToken);
				storageTokenP
					.then((storageToken) => {
						res.send(storageToken);
					})
					.catch((error) => {
						res.status(500).send((error as Error).message);
					});
			},
		},
		{
			name: "get-push-token",
			path: "/pushToken",
			middleware: (req: Request, res: Response) => {
				pushTokenP ??= tokenManager
					.getPushTokens(
						server,
						{ clientId },
						{
							type: "password",
							username,
							password,
						},
					)
					.then((tokens) => tokens.accessToken);
				pushTokenP
					.then((pushToken) => {
						res.send(pushToken);
					})
					.catch((error) => {
						res.status(500).send((error as Error).message);
					});
			},
		},
	];
};
