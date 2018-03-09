import * as dbService from "../db";

export function getTenants(
    mongoManager: dbService.MongoManager,
    collectionName: string): Promise<any> {

    const tenantsP = mongoManager.getDatabase().then(async (db) => {
        const collection = await db.collection<any>(collectionName);
        const dbTenants = await collection.findAll();

        return dbTenants;
    });

    return tenantsP;
}

export async function addTenant(
    mongoManager: dbService.MongoManager,
    collectionName: string,
    tenant: any): Promise<any> {

    const db = await mongoManager.getDatabase();
    const collection = await db.collection<any>(collectionName);
    return collection.insertOne(tenant);
}
