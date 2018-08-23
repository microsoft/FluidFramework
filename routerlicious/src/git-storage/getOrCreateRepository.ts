import * as request from "request-promise-native";
import * as resources from "gitresources";

export async function getOrCreateRepository(endpoint: string, owner: string, repository: string): Promise<void> {
    console.log(`Get Repo: ${endpoint}/${owner}/${repository}`);
    const details = await request.get(`${endpoint}/repos/${owner}/${repository}`)
        .catch((error) => error.statusCode === 400 ? null : Promise.reject(error));
    if (!details) {
        console.log(`Create Repo: ${endpoint}/${owner}/${repository}`);
        const createParams: resources.ICreateRepoParams = {
            name: repository,
        };
        await request.post(`${endpoint}/${owner}/repos`, {
            body: createParams,
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            json: true,
        });
    }
}