import * as request from "request";
import { ITenant, ITenantConfig, ITenantManager, ITenantStorage } from "../api-core";
import { ICollection } from "../core";
import { getOrCreateRepository, GitManager } from "../git-storage";
import * as clientServices from "../services-client";
import * as utils from "../utils";

export class Tenant implements ITenant {
    public static async Load(config: ITenantConfig): Promise<Tenant> {
        const historian = new clientServices.Historian(config.storage.url, true, false);
        const gitManager = await getOrCreateRepository(
            historian,
            config.storage.url,
            config.storage.owner,
            config.storage.repository);

        return new Tenant(config, gitManager);
    }

    public get id(): string {
        return this.config.id;
    }

    public get gitManager(): GitManager {
        return this.manager;
    }

    public get storage(): ITenantStorage {
        return this.config.storage;
    }

    private constructor(private config: ITenantConfig, private manager: GitManager) {
    }
}

async function verifyAuthToken(service: string, token: any): Promise<api.IAuthenticatedUser> {
    return new Promise<api.IAuthenticatedUser>((resolve, reject) => {
        request.post(
            service,
            {
                body: token,
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json: true,
            },
            (error, result, body) => {
                if (error) {
                    return reject(error);
                }

                if (result.statusCode !== 200) {
                    return reject(result);
                }

                return resolve(body);
            });
    });
}

/**
 * Manages a collection of tenants
 */
export class TenantManager implements ITenantManager {
    constructor(private endpoint: string) {
    }

    public async getTenant(tenantId: string): Promise<ITenant> {
        
    }
}
