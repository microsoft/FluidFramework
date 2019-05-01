export interface ITenantInput {
    name: string;
    storageType: string;
    owner: string;
    repository: string;
    username: string;
    password: string;
    ordererType: string;
}

export interface IUser {
    displayName: string;
}

export interface ITenantStorage {
    // Historian backed URL to the storage provider
    url: string;

    // Direct access URL to the storage provider
    direct: string;

    // Storage provider owner
    owner: string;

    // Storage provider repository
    repository: string;

    // Access credentials to the storage provider
    credentials: {
        // User accessing the storage provider
        user: string;

        // Password for the storage provider
        password: string;
    };
}

export interface IOrderer {
    // URL to the ordering service
    url: string;

    // Type of ordering service
    type: string;
}

export interface ITenant {
    // Database ID for the tenant.
    id: string;

    // Friendly name for the tenant.
    name: string;

    // Key for the tenant
    key: string;

    // Deleted flag.
    deleted: boolean;

    // storage
    storage: ITenantStorage;

    // ordering service
    orderer: IOrderer;

    // Type of underlying storage
    provider: string;

    // Historian URL endpoint
    historianUrl: string;
}

export interface IPackage {
    // Package name
    name: string;

    // Package version
    version: string;
}

export interface IData {

    tenants: ITenant[];

    packages: IPackage[];
}
