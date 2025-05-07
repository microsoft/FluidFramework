/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as resources from "@fluidframework/gitresources";
import { default as Axios, RawAxiosRequestHeaders, type AxiosError } from "axios";

/**
 * @internal
 */
export function isAxiosCanceledError(error: AxiosError): boolean {
	return (
		error.name === "CanceledError" &&
		error.code !== undefined &&
		error.code === Axios.AxiosError.ERR_CANCELED
	);
}

/**
 * @internal
 */
export async function getOrCreateRepository(
	endpoint: string,
	owner: string,
	repository: string,
	headers?: RawAxiosRequestHeaders,
): Promise<void> {
	console.log(`Get Repo: ${endpoint}/${owner}/${repository}`);

	const details = await Axios.get(`${endpoint}/repos/${owner}/${repository}`, { headers }).catch(
		(error) => {
			if (error.response && error.response.status === 400) {
				return null;
			} else {
				throw error;
			}
		},
	);

	if (!details || details.status === 400) {
		console.log(`Create Repo: ${endpoint}/${owner}/${repository}`);
		const createParams: resources.ICreateRepoParams = {
			name: repository,
		};

		await Axios.post(`${endpoint}/${owner}/repos`, createParams, { headers });
	}
}

/**
 * getRandomInt is not and should not be used as part of any secure random number generation
 * @internal
 */
export const getRandomInt = (range: number) => Math.floor(Math.random() * range);
