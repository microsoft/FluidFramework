/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fetch from "isomorphic-fetch";

import { type IOdspAuthRequestInfo, authRequestWithRetry } from "./odspAuth.js";

// eslint-disable-next-line jsdoc/require-description -- TODO: Add documentation
/**
 * @internal
 */
export async function getAsync(
	url: string,
	authRequestInfo: IOdspAuthRequestInfo,
): Promise<Response> {
	return authRequest(authRequestInfo, async (config: RequestInit) => fetch(url, config));
}

// eslint-disable-next-line jsdoc/require-description -- TODO: Add documentation
/**
 * @internal
 */
export async function putAsync(
	url: string,
	authRequestInfo: IOdspAuthRequestInfo,
): Promise<Response> {
	return authRequest(authRequestInfo, async (config: RequestInit) => {
		const putConfig = {
			...config,
			method: "PUT",
		};
		return fetch(url, putConfig);
	});
}

// eslint-disable-next-line jsdoc/require-description -- TODO: Add documentation
/**
 * @internal
 */
export async function postAsync(
	url: string,
	body: BodyInit | undefined,
	authRequestInfo: IOdspAuthRequestInfo,
): Promise<Response> {
	return authRequest(authRequestInfo, async (config: RequestInit) => {
		const postConfig = {
			...config,
			body,
			method: "POST",
		};
		return fetch(url, postConfig);
	});
}

// eslint-disable-next-line jsdoc/require-description -- TODO: Add documentation
/**
 * @internal
 */
export async function unauthPostAsync(
	url: string,
	body: BodyInit | undefined,
): Promise<Response> {
	return safeRequestCore(async () => {
		return fetch(url, { body, method: "POST" });
	});
}

async function authRequest(
	authRequestInfo: IOdspAuthRequestInfo,
	requestCallback: (config: RequestInit) => Promise<Response>,
): Promise<Response> {
	return authRequestWithRetry(authRequestInfo, async (config: RequestInit) =>
		safeRequestCore(async () => requestCallback(config)),
	);
}

async function safeRequestCore(requestCallback: () => Promise<Response>): Promise<Response> {
	let response: Response;
	try {
		response = await requestCallback();
	} catch (error: unknown) {
		// TODO: narrow to a real error type here
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		if ((error as any)?.response?.status) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
			response = (error as any).response;
		} else {
			throw error;
		}
	}
	return response;
}
