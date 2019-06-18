/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPraguePackage, IUser } from "@prague/container-definitions";
import { IAlfredTenant } from "@prague/services-core";
import { generateToken } from "@prague/services-core";
import Axios from "axios";
import * as _ from "lodash";
import * as winston from "winston";

export interface IAlfredUser extends IUser {
    displayName: string;
    name: string;
}

export interface ICachedPackage {
    entrypoint: string;
    scripts: Array<{ id: string, url: string }>;
}

/**
 * Helper function to return tenant specific configuration
 */
export function getConfig(
    config: any,
    tenantId: string,
    trackError: boolean,
): string {
    // Make a copy of the config to avoid destructive modifications to the original
    const updatedConfig = _.cloneDeep(config);
    updatedConfig.tenantId = tenantId;
    updatedConfig.trackError = trackError;
    updatedConfig.client = {
        permission: [],
        type: "browser",
    };
    updatedConfig.blobStorageUrl = updatedConfig.blobStorageUrl.replace("historian:3000", "localhost:3001");
    updatedConfig.historianApi = true;

    return JSON.stringify(updatedConfig);
}

export function getToken(tenantId: string, documentId: string, tenants: IAlfredTenant[], user?: IAlfredUser): string {
    for (const tenant of tenants) {
        if (tenantId === tenant.id) {
            return generateToken(tenantId, documentId, tenant.key, user);
        }
    }

    throw new Error("Invalid tenant");
}

const scriptCache = new Map<string, Promise<ICachedPackage>>();

export function getScriptsForCode(externalUrl: string, internalUrl: string, pkg: string): Promise<ICachedPackage> {
    if (!pkg) {
        return null;
    }

    const components = pkg.match(/(.*)\/(.*)@(.*)/);
    if (!components) {
        return Promise.reject("Invalid package");
    }

    winston.info(pkg);
    if (!scriptCache.has(pkg)) {
        const [, scope, name, version] = components;
        const packageUrl = `${internalUrl}/${encodeURI(scope)}/${encodeURI(`${name}@${version}`)}`;
        const url = `${packageUrl}/package.json`;
        const packageP = Axios.get<IPraguePackage>(url).then((result) => {
            return {
                entrypoint: result.data.prague.browser.entrypoint,
                scripts: result.data.prague.browser.bundle.map(
                    (script, index) => {
                        return {
                            id: `${name}-${index}`,
                            url: `${packageUrl}/${script}`.replace(internalUrl, externalUrl),
                        };
                    }),
            };
        });
        scriptCache.set(pkg, packageP);
    }

    return scriptCache.get(pkg);
}
