import * as utils from "../utils";

export interface ITenant {
    name: string;
    key: string;
}

export async function refreshTenantsFromDb(
    mongoManager: utils.MongoManager,
    collectionName: string): Promise<Map<string, string>> {

    const tenants = new Map<string, string>();
    const dbTenants = await getTenants(mongoManager, collectionName);

    for (const dbTenant of dbTenants) {
        tenants.set(dbTenant.name, dbTenant.key);
    }

    return tenants;
}

async function getTenants(mongoManager: utils.MongoManager, collectionName: string): Promise<ITenant[]> {
    const db = await mongoManager.getDatabase();
    const collection = db.collection<ITenant>(collectionName);
    const tenants = await collection.findAll();

    return tenants;
}
