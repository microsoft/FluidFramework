import { ITenant, ITenantService } from "./definitions";

export class RiddlerService implements ITenantService {
    constructor(private endpoint: string) {
    }

    public getTenant(tenantId: string, token: string): Promise<ITenant> {
        throw new Error("Method not implemented." + this.endpoint);
    }
}
