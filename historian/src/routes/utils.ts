import { Response } from "express";
import { ICache, ITenantService, RestGitService } from "../services";

/**
 * Helper function to handle a promise that should be returned to the user
 */
export function handleResponse<T>(
    resultP: Promise<T>,
    response: Response,
    cache = true,
    status: number = 200,
    handler: (value: T) => void = (value) => value) {

    resultP.then(handler).then(
        (result) => {
            if (cache) {
                response.setHeader("Cache-Control", "public, max-age=31536000");
            }

            response.status(status).json(result);
        },
        (error) => {
            response.status(400).json(error);
        });
}

export async function createGitService(
    tenantId: string,
    token: string,
    tenantService: ITenantService,
    cache: ICache): Promise<RestGitService> {

    const details = await tenantService.getTenant(tenantId, token);
    const service = new RestGitService(details.storage, cache);

    return service;
}
