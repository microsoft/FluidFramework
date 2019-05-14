import { IClient, IPlatform, IPragueResolvedUrl } from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { ISharedMap } from "@prague/map";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import { RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import { NodeCodeLoader, NodePlatform } from "@prague/services";
import { Deferred } from "@prague/utils";
import * as jwt from "jsonwebtoken";
import * as url from "url";
import * as winston from "winston";

const packageUrl = "https://packages.wu2.prague.office-int.com";
const installLocation = "/tmp/chaincode";
const waitTimeoutMS = 60000;

interface ISharedMapWrapper {
    root: ISharedMap;
    attach(platform: IPlatform): Promise<IPlatform>;
}

export class KeyValueLoader {
    private readonly rootDeferred = new Deferred<ISharedMap>();

    constructor(
        private orderer: string,
        private storage: string,
        private tenantId: string,
        private secret: string,
        private jwtKey: string,
        private documentId: string,
        private codePackage: string) {
    }

    public get rootMap(): Promise<ISharedMap> {
        return this.rootDeferred.promise;
    }

    public async load(): Promise<void> {
        const {loader, documentUrl} = this.loadInternal();
        winston.info(`Resolving ${documentUrl}`);
        const container = await loader.resolve({ url: documentUrl });
        winston.info(`Resolved ${documentUrl}`);
        this.registerAttach(loader, container, documentUrl, new NodePlatform());
        if (!container.existing) {
            await this.initializeChaincode(container, this.codePackage)
                .catch((error) => winston.error("chaincode error", error));
        }
    }

    private registerAttach(loader: Loader, container: Container, uri: string, platform: NodePlatform) {
        this.attach(loader, uri, platform);
        container.on("contextChanged", (value) => {
            this.attach(loader, uri, platform);
        });
    }

    private async attach(loader: Loader, docUrl: string, platform: NodePlatform) {
        const response = await loader.request({ url: docUrl });
        if (response.status !== 200) {
            return;
        }
        if (response.mimeType === "prague/component") {
            const keyValueComponent = response.value as ISharedMapWrapper;
            await keyValueComponent.attach(platform);
            const rootMap = keyValueComponent.root as ISharedMap;
            winston.info(`Resolved key-value component`);
            this.rootDeferred.resolve(rootMap);
        }
    }

    private loadInternal() {
        const hostToken = jwt.sign(
            {
                user: "admin-portal",
            },
            this.jwtKey);

        const token = jwt.sign(
            {
                documentId: this.documentId,
                permission: "read:write",
                tenantId: this.tenantId,
                user: {id: "admin-portal"},
            },
            this.secret);

        const documentUrl = `prague://${url.parse(this.orderer).host}` +
        `/${encodeURIComponent(this.tenantId)}` +
        `/${encodeURIComponent(this.documentId)}`;

        const deltaStorageUrl = this.orderer +
        `/deltas/${encodeURIComponent(this.tenantId)}/${encodeURIComponent(this.documentId)}`;

        const storageUrl = this.storage + "/repos" + `/${encodeURIComponent(this.tenantId)}`;

        const resolved: IPragueResolvedUrl = {
            endpoints: {
                deltaStorageUrl,
                ordererUrl: this.orderer,
                storageUrl,
            },
            tokens: { jwt: token },
            type: "prague",
            url: documentUrl,
        };

        const resolver = new ContainerUrlResolver(
            this.orderer,
            hostToken,
            new Map([[documentUrl, resolved]]));

        // Join as readonly.
        const client: Partial<IClient> = { type: "robot" };

        const loader = new Loader(
            { resolver },
            new RouterliciousDocumentServiceFactory(),
            new NodeCodeLoader(packageUrl, installLocation, waitTimeoutMS),
            { client });

        return {loader, documentUrl};
    }

    private async initializeChaincode(document: Container, pkg: string): Promise<void> {
        if (!pkg) {
            return;
        }
        const quorum = document.getQuorum();
        // Wait for connection so that proposals can be sent
        if (!document.connected) {
            await new Promise<void>((resolve) => document.on("connected", () => resolve()));
        }
        // And then make the proposal if a code proposal has not yet been made
        if (!quorum.has("code2")) {
            await quorum.propose("code2", pkg);
        }
        console.log(`Code is ${quorum.get("code2")}`);
    }
}
