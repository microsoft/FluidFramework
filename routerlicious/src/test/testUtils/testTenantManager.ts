import { ITenant, ITenantManager, ITenantStorage } from "../../api-core";
import { GitManager } from "../../git-storage";
import { TestHistorian } from "./";

export class TestTenant implements ITenant {
    private url = "http://test";
    private owner = "test";
    private repository = "test";
    private manager: GitManager;

    constructor() {
        const testHistorian = new TestHistorian();
        this.manager = new GitManager(testHistorian, this.url, this.owner, this.repository);
    }

    public get gitManager(): GitManager {
        return this.manager;
    }

    public get storage(): ITenantStorage {
        return {
            owner: this.owner,
            publicUrl: this.url,
            repository: this.repository,
            url: this.url,
        };
    }
}

export class TestTenantManager implements ITenantManager {
    private tenant = new TestTenant();

    public getTenant(id: string): ITenant {
        return this.tenant;
    }
}
