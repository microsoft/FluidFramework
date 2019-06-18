/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as resources from "@prague/gitresources";
import Axios from "axios";

export async function getOrCreateRepository(endpoint: string, owner: string, repository: string): Promise<void> {
    console.log(`Get Repo: ${endpoint}/${owner}/${repository}`);

    /* tslint:disable:promise-function-async */
    /* tslint:disable:no-unsafe-any */
    const details = await Axios.get(`${endpoint}/repos/${owner}/${repository}`)
        .catch((error) => error.response && error.response.status === 400 ? null : Promise.reject(error));

    if (!details) {
        console.log(`Create Repo: ${endpoint}/${owner}/${repository}`);
        const createParams: resources.ICreateRepoParams = {
            name: repository,
        };

        await Axios.post(`${endpoint}/${owner}/repos`, createParams);
    }
}
