import { IUrlResolver, IRequest, IResolvedUrl, IPragueResolvedUrl, ITokenClaims } from "@prague/container-definitions";
import * as jwt from "jsonwebtoken";

export class InsecureUrlResolver implements IUrlResolver {
    constructor(
        private readonly ordererUrl: string,
        private readonly storageUrl: string,
        private readonly user: string,
        private readonly key: string,
    ) { }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {

        // tslint:disable-next-line:no-http-string - Replacing protocol so URL will parse.
        const parsedUrl = new URL(request.url.replace(/^prague:\/\//, "http://"));
        const [tenantId, documentId, ...pathParts] = parsedUrl.pathname.substr(1).split("/");
        let path = pathParts.join("/");
        if (path.length > 0) {
            path = `/${encodeURIComponent(path)}`;
        }

        const documentUrl = `prague://${new URL(this.ordererUrl).host}` +
            `/${encodeURIComponent(tenantId)}` +
            `/${encodeURIComponent(documentId)}` +
            `${path}`;

        const deltaStorageUrl =
            `${this.ordererUrl}/deltas/${encodeURIComponent(tenantId)}/${encodeURIComponent(documentId)}`;

        const storageUrl = `${this.storageUrl}/repos/${encodeURIComponent(tenantId)}`;

        // tslint:disable-next-line:no-unnecessary-local-variable
        const response: IPragueResolvedUrl = {
            endpoints: {
                deltaStorageUrl,
                ordererUrl: this.ordererUrl,
                storageUrl,
            },
            tokens: { jwt: this.auth(tenantId, documentId) },
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
