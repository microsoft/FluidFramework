import { IExperimentalUrlResolver, IResolvedUrl, IUrlResolver } from "@microsoft/fluid-driver-definitions";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { TestResolver } from "@microsoft/fluid-local-driver";
import { InsecureUrlResolver } from "@microsoft/fluid-test-runtime-utils";
// eslint-disable-next-line import/no-internal-modules
import * as uuid from "uuid/v4";
import { getRandomName } from "@microsoft/fluid-server-services-client";
import { IOdspNewFileParams } from "@microsoft/fluid-odsp-driver";
import { RouteOptions, IDevServerUser } from "./loader";
import { OdspUrlResolver } from "./odspUrlResolver";

function getUrlResolver(
    documentId: string,
    options: RouteOptions,
): IUrlResolver {
    switch (options.mode) {
        case "docker":
            return new InsecureUrlResolver(
                "http://localhost:3000",
                "http://localhost:3003",
                "http://localhost:3001",
                options.tenantId,
                options.tenantSecret,
                getUser(),
                options.bearerSecret);

        case "r11s":
            return new InsecureUrlResolver(
                options.fluidHost,
                options.fluidHost.replace("www", "alfred"),
                options.fluidHost.replace("www", "historian"),
                options.tenantId,
                options.tenantSecret,
                getUser(),
                options.bearerSecret);

        case "tinylicious":
            return new InsecureUrlResolver(
                "http://localhost:3000",
                "http://localhost:3000",
                "http://localhost:3000",
                "tinylicious",
                "12345",
                getUser(),
                options.bearerSecret);

        case "spo":
        case "spo-df":
            return new OdspUrlResolver(
                options.server,
                { accessToken: options.odspAccessToken });

        default: // Local
            return new TestResolver(documentId);
    }
}

const getUser = (): IDevServerUser => ({
    id: uuid(),
    name: getRandomName(),
});


export class MultiUrlResolver implements IExperimentalUrlResolver{
    public readonly isExperimentalUrlResolver = true;

    private readonly urlResolver: IUrlResolver;
    constructor(
        private readonly rawUrl: string,
        private readonly documentId: string,
        private readonly options: RouteOptions){
        this.urlResolver = getUrlResolver(documentId, options);
    }

    async requestUrl(resolvedUrl: IResolvedUrl, request: IRequest): Promise<string> {
        return `${this.rawUrl}/${this.documentId}/${request.url}`;
    }

    async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
        return this.urlResolver.resolve(request);
    }


    public createRequestForCreateNew(
        fileName: string,
    ): IRequest {
        switch (this.options.mode) {
            case "r11s":
            case "docker":
            case "tinylicious":
                return (this.urlResolver as InsecureUrlResolver).createCreateNewRequest(this.rawUrl, fileName);

            case "spo":
            case "spo-df":
                const params: IOdspNewFileParams = {
                    fileName,
                    driveId: this.options.driveId,
                    filePath: "/r11s/",
                    siteUrl: `https://${this.options.server}`,
                };
                return (this.urlResolver as OdspUrlResolver).createCreateNewRequest(this.rawUrl, params);
                break;

            default: // Local
                return (this.urlResolver as TestResolver).createCreateNewRequest();
        }
    }
}
