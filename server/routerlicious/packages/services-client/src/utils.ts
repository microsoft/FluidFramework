/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type * as resources from "@fluidframework/gitresources";

import type { RawRequestHeaders } from "./fetchTypes";

/**
 * @internal
 */
export async function getOrCreateRepository(
	endpoint: string,
	owner: string,
	repository: string,
	headers?: RawRequestHeaders,
): Promise<void> {
	console.log(`Get Repo: ${endpoint}/${owner}/${repository}`);

	const fetchHeaders: Record<string, string> = {};
	if (headers) {
		for (const [key, value] of Object.entries(headers)) {
			fetchHeaders[key] = String(value);
		}
	}

	let details: Response | null;
	try {
		details = await fetch(`${endpoint}/repos/${owner}/${repository}`, {
			headers: fetchHeaders,
		});
		if (details.status === 400) {
			details = null;
		}
	} catch {
		details = null;
	}

	if (!details || details.status === 400) {
		console.log(`Create Repo: ${endpoint}/${owner}/${repository}`);
		const createParams: resources.ICreateRepoParams = {
			name: repository,
		};

		await fetch(`${endpoint}/${owner}/repos`, {
			method: "POST",
			headers: {
				...fetchHeaders,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(createParams),
		});
	}
}

/**
 * getRandomInt is not and should not be used as part of any secure random number generation
 * @internal
 */
export const getRandomInt = (range: number) => Math.floor(Math.random() * range);
