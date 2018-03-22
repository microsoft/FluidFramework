import cloneDeep = require("lodash/cloneDeep");
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

    public get name(): string {
        return this.config.name;
    }

    public get gitManager(): GitManager {
        return this.manager;
    }

    public get storage(): ITenantStorage {
        return this.config.storage;
    }

    private constructor(private config: ITenantConfig, private manager: GitManager) {
    }

    public isDefault(): boolean {
        return this.config.isDefault === true;
    }
}

/**
 * Manages a collection of tenants
 */
export class TenantManager implements ITenantManager {
    public static async Load(mongoManager: utils.MongoManager, config: ITenantConfig[],
                             tenantsCollectionName: string): Promise<TenantManager> {
        const tenantsP = new Array<Promise<Tenant>>();
        for (const tenant of config) {
            const tenantP = Tenant.Load(tenant);
            tenantsP.push(tenantP);
        }
        const tenants = await Promise.all(tenantsP);
        const db = await mongoManager.getDatabase();
        const tenantsCollection = await db.collection<any>(tenantsCollectionName);

        // Initialize the tenant manager
        const manager = new TenantManager(tenants, tenantsCollection, config);

        return manager;
    }

    private tenants = new Map<string, Tenant>();
    private defaultTenant: Tenant;

    private constructor(tenants: Tenant[], private collection: ICollection<any>, private config: ITenantConfig[]) {
        for (const tenant of tenants) {
            this.tenants.set(tenant.name, tenant);
            this.defaultTenant = tenant.isDefault() ? tenant : this.defaultTenant;
        }
    }

    public getTenant(tenantId: string): Promise<ITenant> {
        return new Promise<ITenant>((resolve, reject) => {
            if (!tenantId) {
                resolve(this.defaultTenant);
            } else {
                this.resolveTenant(tenantId).then((tenant) => {
                    resolve(tenant);
                }, (err) => {
                    reject(err);
                });
            }
        });
    }

    // TODO: This is a complete hack to make the storage endpoint demo work.
    // If a tenant is found in the DB, we configure a new tenant based on its storage endpoint and cash it.
    // Ideally we should just store the storage config in DB and look up for every tenant.
    private resolveTenant(tenantId: string): Promise<ITenant> {
        return new Promise<ITenant>((resolve, reject) => {
            if (this.tenants.has(tenantId)) {
                resolve(this.tenants.get(tenantId));
            } else {
                this.getTenantsFromDB().then((tenantStorageMap: Map<string, string>) => {
                    if (tenantStorageMap.has(tenantId)) {
                        const storageName = tenantStorageMap.get(tenantId);
                        const newConfig = cloneDeep(this.getTenantConfig(storageName));
                        newConfig.name = tenantId;
                        Tenant.Load(newConfig).then((tenant) => {
                            this.tenants.set(tenant.name, tenant);
                            resolve(tenant);
                        });
                    } else {
                        reject("Invaid tenant name");
                    }
                }, (err) => {
                    reject(err);
                });
            }
        });
    }

    private getTenantConfig(storageName: string): ITenantConfig {
        const matchedConfigs = this.config.filter((item) => item.name === storageName);
        return matchedConfigs[0];
    }

    private getTenantsFromDB(): Promise<Map<string, string>> {
        const tenants = new Map<string, string>();
        return new Promise<Map<string, string>>((resolve, reject) => {
            this.collection.findAll().then((dbTenants) => {
                for (const dbTenant of dbTenants) {
                    tenants.set(dbTenant.name, dbTenant.storage);
                }
                resolve(tenants);
            }, (error) => {
                reject(error);
            });
        });
    }
}
