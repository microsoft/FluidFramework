import { ITenant, ITenantManager, ITenantStorage } from "../../core";
import { GitManager } from "../../git-storage";
import { TestHistorian } from "./";

export class TestTenant implements ITenant {
    private url = "http://test";
    private owner = "test";
    private repository = "test";
    private manager: GitManager;

    constructor() {
        const testHistorian = new TestHistorian();
        this.manager = new GitManager(testHistorian);
    }

    public get gitManager(): GitManager {
        return this.manager;
    }

    public get storage(): ITenantStorage {
        return {
            credentials: null,
            direct: null,
            owner: this.owner,
            repository: this.repository,
            url: this.url,
        };
    }
}

export class TestTenantManager implements ITenantManager {
    private tenant = new TestTenant();

    public verifyToken(token: string): Promise<void> {
        return Promise.resolve();
    }

    public getTenant(id: string): Promise<ITenant> {
        return Promise.resolve(this.tenant);
    }

    public getKey(tenantId: string): Promise<string> {
        return Promise.resolve("test");
    }
}
