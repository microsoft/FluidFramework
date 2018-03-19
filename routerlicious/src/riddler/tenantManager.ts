import * as winston from "winston";
import * as utils from "../utils";

export function refreshTenantsFromDb(mongoManager: utils.MongoManager, collectionName: string):
    Promise<Map<string, string>> {
        const tenants = new Map<string, string>();
        return new Promise<Map<string, string>>((resolve, reject) => {
            const dbTenantsP = getTenants(mongoManager, collectionName);
            dbTenantsP.then((dbTenants) => {
                for (const dbTenant of dbTenants) {
                    tenants.set(dbTenant.name, dbTenant.key);
                }
                resolve(tenants);
            }, (error) => {
                winston.error(`Error reading ${collectionName} from mongo`);
                reject(error);
            });
        });
}

function getTenants(
    mongoManager: utils.MongoManager,
    collectionName: string): Promise<any> {

    const tenantsP = mongoManager.getDatabase().then(async (db) => {
        const collection = await db.collection<any>(collectionName);
        const dbTenants = await collection.findAll();

        return dbTenants;
    });
    return tenantsP;
}
