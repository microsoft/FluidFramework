/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import-x/no-nodejs-modules
import process from "node:process";

import type { Middleware, Request, Response } from "webpack-dev-server";

import { getOdspCredentials } from "./tenantUtils.js";

/**
 * Construct the set of middleware required to support the odsp example driver.
 *
 * @remarks
 * Relies on environment variables containing the test tenant and user information, which will be
 * automatically configured by running tenant-setup.
 *
 * process.env.login__odsp__fic__test__users - JSON array of users/credentials with deducible tenants
 */
export const createOdspMiddlewares = (): Middleware[] => {
	if (process.env.login__odsp__fic__test__users === undefined) {
		throw new Error(
			"process.env.login__odsp__fic__test__users is missing. Make sure you ran tenant-setup and restarted your terminal.",
		);
	}

	const credentials = getOdspCredentials("odsp", 0);
	const firstCredential = credentials[0];
	if (firstCredential === undefined) {
		throw new Error("No credentials found from getOdspCredentials.");
	}
	const { username } = firstCredential;

	// Derive siteUrl from the username's email domain
	const atIndex = username.indexOf("@");
	if (atIndex === -1) {
		throw new Error(`Username "${username}" is not a valid email address (missing "@").`);
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
				storageTokenP ??= firstCredential.fetchToken("storage");
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
				pushTokenP ??= firstCredential.fetchToken("push");
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
