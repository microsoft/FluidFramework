import {
    IPragueResolvedUrl,
    IRequest,
    IResolvedUrl,
    ITokenClaims,
    IUrlResolver,
} from "@prague/container-definitions";
import * as jwt from "jsonwebtoken";

export class InsecureUrlResolver implements IUrlResolver {
    constructor(
        private readonly ordererUrl: string,
        private readonly storageUrl: string,
        private readonly tenantId: string,
        private readonly key: string,
        private readonly user: string,
    ) { }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const parsedUrl = new URL(request.url);
        const documentId = parsedUrl.pathname.substr(1).split("/")[0];

        const documentUrl = `prague://${new URL(this.ordererUrl).host}` +
            `/${encodeURIComponent(this.tenantId)}` +
            parsedUrl.pathname;

        const deltaStorageUrl =
            `${this.ordererUrl}/deltas/${encodeURIComponent(this.tenantId)}/${encodeURIComponent(documentId)}`;

        const storageUrl = `${this.storageUrl}/repos/${encodeURIComponent(this.tenantId)}`;

        const response: IPragueResolvedUrl = {
            endpoints: {
                deltaStorageUrl,
                ordererUrl: this.ordererUrl,
                storageUrl,
            },
            tokens: { jwt: this.auth(this.tenantId, documentId) },
            type: "prague",
            url: documentUrl,
        };

        return response;
    }

    private auth(tenantId: string, documentId: string) {
        const claims: ITokenClaims = {
            documentId,
            permission: "read:write",
            tenantId,
            user: { id: this.user },
        };

        return jwt.sign(claims, this.key);
    }
}
