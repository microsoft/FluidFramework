/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IRequest,
} from "@microsoft/fluid-component-core-interfaces";
import {
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
    IUser,
    ScopeType,
} from "@microsoft/fluid-protocol-definitions";
import { generateToken, IAlfredTenant } from "@microsoft/fluid-server-services-core";
import { parse } from "url";

const r11sServers = [
    "www.wu2-ppe.prague.office-int.com",
    "www.wu2.prague.office-int.com",
    "www.eu.prague.office-int.com",
];

export class RouterliciousUrlResolver implements IUrlResolver {

    constructor(
        private readonly config: IConfig | undefined,
        private token: string | undefined,
        private readonly appTenants: IAlfredTenant[],
        private readonly scopes?: ScopeType[],
        private readonly user?: IAlfredUser) {
    }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const reqUrl = new URL(request.url);
        const server = reqUrl.hostname.toLowerCase();
        if (r11sServers.indexOf(server) !== -1 || (server === "localhost" && reqUrl.port === "3000")) {
            const path = reqUrl.pathname.split("/");
            let tenantId;
            let documentId;
            if (path.length >= 4) {
                tenantId = path[2];
                documentId = path[3];
            } else {
                tenantId = "fluid";
                documentId = path[2];
            }

            if (!this.token) {
                this.token = getR11sToken(tenantId, documentId, this.appTenants, this.scopes, this.user);
            }

            const isLocalHost = server === "localhost" ? true : false;

            const serverSuffix = isLocalHost ? `${server}:3003` : server.substring(4);

            let fluidUrl = "fluid://" +
                `${this.config ? parse(this.config.serverUrl).host : serverSuffix}/` +
                `${encodeURIComponent(tenantId)}/` +
                `${encodeURIComponent(documentId)}`;

            if (reqUrl.search) {
                // In case of any additional parameters add them back to the url
                const searchParams = reqUrl.search;
                if (!!searchParams) {
                    fluidUrl += searchParams;
                }
            }

            const storageUrl = this.config ? this.config.blobStorageUrl.replace("historian:3000", "localhost:3001") :
                isLocalHost ?
                    `http://localhost:3001/repos/${tenantId}` : `https://historian.${serverSuffix}/repos/${tenantId}`;
            const ordererUrl = this.config ? this.config.serverUrl :
                isLocalHost ?
                    `http://localhost:3003/` : `https://alfred.${serverSuffix}`;
            const deltaStorageUrl = this.config ?
                `${this.config.serverUrl}/deltas/${encodeURIComponent(tenantId)}/${encodeURIComponent(documentId)}` :
                    isLocalHost ?
                        `http://localhost:3003/deltas/${tenantId}/${documentId}` :
                            `https://alfred.${serverSuffix}/deltas/${tenantId}/${documentId}`;

            const resolved: IFluidResolvedUrl = {
                endpoints: {
                    storageUrl,
                    deltaStorageUrl,
                    ordererUrl,
                },
                tokens: { jwt: this.token },
                type: "fluid",
                url: fluidUrl,
            };
            return resolved;
        }
        return Promise.reject("Cannot resolve the given url!!");
    }
}

function getR11sToken(
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
                return generateToken(tenantId, documentId, tenant.key, scope!, user);
            }
        }

        throw new Error("Invalid tenant");
}

interface IAlfredUser extends IUser {
    displayName: string;
    name: string;
}

export interface IConfig {
    serverUrl: string;
    blobStorageUrl: string;
}
