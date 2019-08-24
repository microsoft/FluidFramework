/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getLoader } from "@prague/base-host";
import { IComponent } from "@prague/component-core-interfaces";
import { Container, Loader } from "@prague/container-loader";
import { IResolvedUrl, ScopeType } from "@prague/protocol-definitions";
import { NodeCodeLoader } from "@prague/services";
import { Deferred } from "@prague/utils";
import Axios from "axios";
import * as jwt from "jsonwebtoken";
import { Provider } from "nconf";
import { parse } from "url";
import * as winston from "winston";

const packageUrl = "https://packages.wu2.prague.office-int.com";
const installLocation = "/tmp/chaincode";
const waitTimeoutMS = 60000;

export interface IKeyValue {
    set(key: string, value: any): void;
    get(key: string): any;
    entries(): IterableIterator<[string, any]>;
    delete(key: string): boolean;
}

export class KeyValueLoader {
    public static async load(config: Provider) {
        const documentUrl = config.get("keyValue:documentUrl");
        winston.info(`Loading key value cache from ${documentUrl}`);
        const hostToken = jwt.sign(
            {
                user: "admin-portal",
            },
            config.get("keyValue:jwtKey"));

        const headers = {
            Authorization: `Bearer ${hostToken}`,
        };

        const parsedUrl = parse(documentUrl);
        const loadUrl = `${parsedUrl.protocol}//${parsedUrl.host}/api/v1/load`;
        const result = await Axios.post<IResolvedUrl>(
            loadUrl,
            {
                scopes: [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
                url: documentUrl,
            },
            {
                headers,
            });

        const loader = getLoader(
            config.get("keyValue:gatewayUrl"),
            documentUrl,
            result.data,
            undefined,
            hostToken,
            {},
            new NodeCodeLoader(packageUrl, installLocation, waitTimeoutMS),
            undefined,
        );
        const container = await loader.resolve({ url: documentUrl });
        winston.info(`Loaded key value container from ${documentUrl}`);

        return new KeyValueLoader(loader, container, documentUrl);
    }
    private readonly kvDeferred = new Deferred<IKeyValue>();

    constructor(loader: Loader, container: Container, url: string) {
        this.registerAttach(loader, container, url);
    }

    public get cache(): Promise<IKeyValue> {
        return this.kvDeferred.promise;
    }

    private registerAttach(loader: Loader, container: Container, uri: string) {
        this.attach(loader, uri);
        container.on("contextChanged", (value) => {
            this.attach(loader, uri);
        });
    }

    private async attach(loader: Loader, docUrl: string) {
        const response = await loader.request({ url: docUrl });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            return;
        }
        const component = response.value as IComponent;
        const keyValue = (component.IComponentRouter as unknown) as IKeyValue;
        winston.info(`Resolved key-value component`);
        this.kvDeferred.resolve(keyValue);
    }
}
