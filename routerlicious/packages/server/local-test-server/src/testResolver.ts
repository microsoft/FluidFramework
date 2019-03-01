import { IPragueResolvedUrl, IRequest, IResolvedUrl, IUrlResolver } from "@prague/container-definitions";
import { generateToken } from "@prague/services-core";

export class TestResolver implements IUrlResolver {
    private id = "documentId";
    private tenantId = "tenantId";
    private tokenKey = "tokenKey";

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const resolved: IPragueResolvedUrl = {
            ordererUrl: "test.com",
            storageUrl: "test.com",
            tokens: { jwt: generateToken(this.tenantId, this.id, this.tokenKey) },
            type: "prague",
            url: `prague://test.com/${this.tenantId}/${this.id}`,
        };

        return resolved;
    }
}
