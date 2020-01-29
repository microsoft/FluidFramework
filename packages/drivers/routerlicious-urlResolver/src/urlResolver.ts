/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import {
    IRequest,
} from "@microsoft/fluid-component-core-interfaces";
import {
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
} from "@microsoft/fluid-driver-definitions";
import { IUser, ScopeType } from "@microsoft/fluid-protocol-definitions";
import { generateToken, IAlfredTenant } from "@microsoft/fluid-server-services-client";

const r11sServers = [
    "www.wu2-ppe.prague.office-int.com",
    "www.wu2.prague.office-int.com",
    "www.eu.prague.office-int.com",
];

export class RouterliciousUrlResolver implements IUrlResolver {

    constructor(
        private readonly config: IConfig | undefined,
        private readonly getToken: (() => Promise<string>) | undefined,
        private readonly appTenants: IAlfredTenant[],
        private readonly scopes?: ScopeType[],
        private readonly user?: IAlfredUser) {
    }

    /**
     * Handles a request and returns the relevant endpoints for the environment
     */
    public async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
        let requestedUrl = request.url;

        // If we know the original hostname, reinsert it
        if (this.config && request.url.startsWith("/")) {
            requestedUrl = `http://${(request.hostname ? request.hostname : "dummy")}:3000${request.url}`;
        }

        const reqUrl = new URL(requestedUrl);
        const server = reqUrl.hostname.toLowerCase();

        // What situation is this checking for?
        if (r11sServers.includes(server) || (server === "localhost" && reqUrl.port === "3000") || this.config) {
            const path = reqUrl.pathname.split("/");
            let tenantId: string;
            let documentId: string;
            if (this.config) {
                tenantId = this.config.tenantId;
                documentId = this.config.documentId;
            } else if (path.length >= 4) {
                tenantId = path[2];
                documentId = path[3];
            } else {
                tenantId = "fluid";
                documentId = path[2];
            }

            let token: string;
            if (!this.getToken) {
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                token = getR11sToken(tenantId, documentId, this.appTenants, this.scopes, this.user);
            } else {
                token = await this.getToken();
            }

            const isLocalHost = server === "localhost";
            const isInternalRequest = server.includes("gateway");

            // if isLocalhost, serverSuffix = dummy:3000
            // What is this server object?
            const serverSuffix = isLocalHost ? `${server}:3003` : server.substring(4);

            let fluidUrl = "fluid://" +
                `${this.config ? parse(this.config.serverUrl).host : serverSuffix}/` +
                `${encodeURIComponent(tenantId)}/` +
                `${encodeURIComponent(documentId)}`;

            if (reqUrl.search) {
                // In case of any additional parameters add them back to the url
                const searchParams = reqUrl.search;
                if (searchParams) {
                    fluidUrl += searchParams;
                }
            }
            let storageUrl2 = "";
            let ordererUrl2 = "";
            let deltaStorageUrl2 = "";

            /* eslint-disable max-len */
            // tslint-disable: max-length

            // Local deployment + Not a request from tiny-web-host || FluidFetchInit
            // Also Kube Deployments have a config.json
            if (this.config) {
                // this storageUrl seems incorrect, perhaps specifically to handle, w
                storageUrl2 = this.config.blobStorageUrl.replace("historian:3000", "localhost:3001");
                ordererUrl2 = this.config.serverUrl;
                deltaStorageUrl2 = `${this.config.serverUrl}/deltas/${encodeURIComponent(tenantId)}/${encodeURIComponent(documentId)}`;
            } else if (isInternalRequest) {
                
            // Not sure when this would happen...
            } else if (isLocalHost) {
                storageUrl2 = `localhost:3001`;
                ordererUrl2 = `http://localhost:3003`;
                deltaStorageUrl2 = `http://localhost:3003/deltas/${tenantId}/${documentId}`;

            // Live server situation
            } else {
                storageUrl2 = `https://historian.${serverSuffix}`;
                ordererUrl2 = `https://alfred.${serverSuffix}`;
                deltaStorageUrl2 = `https://alfred.${serverSuffix}/deltas/${tenantId}/${documentId}`;
            }
            storageUrl2 += `/repos/${tenantId}`;
            ordererUrl2 += ``;
            deltaStorageUrl2 += ``;
            console.log(`${storageUrl2}... ${ordererUrl2}... ${deltaStorageUrl2}`);

            // const resolvedReturn = {
            //     endpoints:{
            //         storageUrl:"https://historian.wu2-ppe.prague.office-int.com/repos/fluid",
            //         deltaStorageUrl:"https://alfred.wu2-ppe.prague.office-int.com/deltas/fluid/Cantisfvl",
            //         ordererUrl:"https://alfred.wu2-ppe.prague.office-int.com"
            //     },
            //     tokens: {
            //         jwt: "",
            //     },
            //     type: "fluid",
            //     url: "fluid://alfred.wu2-ppe.prague.office-int.com/fluid/Cantisfvl?chaincode=@fluid-example/prosemirror@^0.10.0?chaincode=@fluid-example/prosemirror@^0.10.0"};
            /* eslint-enable max-len */

            const storageUrl =
                `${(this.config ? this.config.blobStorageUrl.replace("historian:3000", "localhost:3001")
                    : isLocalHost
                        ? `http://localhost:3001` : `https://historian.${serverSuffix}`)}/repos/${tenantId}`;
            const ordererUrl = this.config ? this.config.serverUrl :
                isLocalHost ?
                    `http://localhost:3003` : `https://alfred.${serverSuffix}`;
            const deltaStorageUrl = this.config ?
                `${this.config.serverUrl}/deltas/${encodeURIComponent(tenantId)}/${encodeURIComponent(documentId)}`
                : isLocalHost ?
                    `http://localhost:3003/deltas/${tenantId}/${documentId}` :
                    `https://alfred.${serverSuffix}/deltas/${tenantId}/${documentId}`;

            const resolved: IFluidResolvedUrl = {
                endpoints: {
                    storageUrl,
                    deltaStorageUrl,
                    ordererUrl,
                },
                tokens: { jwt: token },
                type: "fluid",
                url: fluidUrl,
            };
            return resolved;
        }
        return undefined;
    }
}

export function getR11sToken(
    tenantId: string,
    documentId: string,
    tenants: IAlfredTenant[],
    scopes?: ScopeType[],
    user?: IAlfredUser): string {
    let scope = scopes;
    if (!scopes) {
        scope = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
    }
    for (const tenant of tenants) {
        if (tenantId === tenant.id) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return generateToken(tenantId, documentId, tenant.key, scope!, user);
        }
    }

    throw new Error("Invalid tenant");
}

export interface IAlfredUser extends IUser {
    displayName: string;
    name: string;
}

export interface IConfig {
    serverUrl: string;
    blobStorageUrl: string;
    tenantId: string;
    documentId: string;
}
