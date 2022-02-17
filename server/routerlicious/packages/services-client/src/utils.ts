/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as resources from "@fluidframework/gitresources";
import Axios from "axios";

export async function getOrCreateRepository(endpoint: string, owner: string, repository: string): Promise<void> {
    console.log(`Get Repo: ${endpoint}/${owner}/${repository}`);

    const details = await Axios.get(`${endpoint}/repos/${owner}/${repository}`)
        .catch((error) => {
            if (error.response && error.response.status === 400) {
                return null;
            } else {
                throw error;
            }
        });

    if (!details || details.status === 400) {
        console.log(`Create Repo: ${endpoint}/${owner}/${repository}`);
        const createParams: resources.ICreateRepoParams = {
            name: repository,
        };

        await Axios.post(`${endpoint}/${owner}/repos`, createParams);
    }
}
