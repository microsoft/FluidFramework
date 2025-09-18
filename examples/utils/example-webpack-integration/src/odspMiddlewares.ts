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
	const testAccounts: unknown = JSON.parse(process.env.login__odsp__test__tenants);
	if (!isTestAccounts(testAccounts) || testAccounts[0] === undefined) {
		throw new Error(
			"process.env.login__odsp__test__tenants is not a valid array of test accounts.",
		);
	}
	const { UserPrincipalName: username, Password: password } = testAccounts[0];
	const emailServer = username.slice(username.indexOf("@") + 1);
	const tenantName = emailServer.slice(0, emailServer.indexOf("."));
	const siteUrl = `https://${tenantName}.sharepoint.com`;
	const server = new URL(siteUrl).host;

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
