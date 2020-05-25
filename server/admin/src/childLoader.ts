/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { parse } from "url";
import { IComponent } from "@fluidframework/component-core-interfaces";
import { IProxyLoaderFactory } from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { Deferred } from "@fluidframework/common-utils";
import {
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { ScopeType } from "@fluidframework/protocol-definitions";
import { DefaultErrorTracking, RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { ContainerUrlResolver } from "@fluidframework/routerlicious-host";
import { NodeCodeLoader, NodeWhiteList } from "@fluidframework/server-services";
import { promiseTimeout } from "@fluidframework/server-services-client";
import Axios from "axios";
import * as jwt from "jsonwebtoken";
import * as winston from "winston";
import { IKeyValue as IKV } from "./definitions";

const packageUrl = "https://packages.wu2.prague.office-int.com";
const installLocation = "/tmp/chaincode";
const waitTimeoutMS = 60000;

export interface IIncomingMessage {
    type: "init" | "get" | "set" | "delete";

    param: any;
}

export interface IOutgoingMessage {
    type: "init" | "get" | "set" | "delete";

    status: boolean;

    value?: any;
}

interface IKeyValue {
    set(key: string, value: any): void;
    get(key: string): any;
    entries(): IterableIterator<[string, any]>;
    delete(key: string): boolean;
}

const cacheLoadTimeoutMS = 30000;

class KeyValueLoader {
    public static async load(config: any) {
        const documentUrl = config.documentUrl;
        winston.info(`Loading key value cache from ${documentUrl}`);
        const hostToken = jwt.sign(
            {
                user: "gateway",
            },
            config.gatewayKey);

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

        const documentServiceFactories: IDocumentServiceFactory[] = [];
        documentServiceFactories.push(new RouterliciousDocumentServiceFactory(
            false,
            new DefaultErrorTracking(),
            false,
            true,
            undefined));

        const resolver = new ContainerUrlResolver(
            config.gatewayUrl,
            hostToken,
            new Map<string, IResolvedUrl>([[documentUrl, result.data]]));

        config.tokens = (result.data as IFluidResolvedUrl).tokens;

        const loader = new Loader(
            resolver,
            documentServiceFactories,
            new NodeCodeLoader(packageUrl, installLocation, waitTimeoutMS, new NodeWhiteList()),
            config,
            {},
            new Map<string, IProxyLoaderFactory>(),
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

let cache: IKeyValue;

process.on("message", async (message: IIncomingMessage) => {
    if (message.type === "init") {
        const keyValueLoaderP = promiseTimeout(cacheLoadTimeoutMS, KeyValueLoader.load(message.param));
        const cacheP = keyValueLoaderP.then((keyValueLoader: KeyValueLoader) => {
            return keyValueLoader.cache;
        }, (err) => {
            return Promise.reject(err);
        });
        cacheP.then((resolvedCache) => {
            cache = resolvedCache;
            const initSuccessMessage: IOutgoingMessage = {
                status: true,
                type: message.type,
            };
            process.send(initSuccessMessage);
        }, (err) => {
            const initFailMessage: IOutgoingMessage = {
                status: false,
                type: message.type,
                value: err,
            };
            process.send(initFailMessage);
        });
    } else if (message.type === "get") {
        if (cache === undefined) {
            const getFailMessage: IOutgoingMessage = {
                status: false,
                type: message.type,
                value: `Called before initialization`,
            };
            process.send(getFailMessage);
        } else {
            const keyValues: IKV[] = [];
            for (const [key, value] of cache.entries()) {
                keyValues.push({ key, value });
            }
            const getSuccessMessage: IOutgoingMessage = {
                status: true,
                type: message.type,
                value: keyValues,
            };
            process.send(getSuccessMessage);
        }
    } else if (message.type === "set") {
        if (cache === undefined) {
            const getFailMessage: IOutgoingMessage = {
                status: false,
                type: message.type,
                value: `Called before initialization`,
            };
            process.send(getFailMessage);
        } else {
            const param = message.param as IKV;
            cache.set(param.key, param.value);
            const getSuccessMessage: IOutgoingMessage = {
                status: true,
                type: message.type,
                value: param,
            };
            process.send(getSuccessMessage);
        }
    } else {
        if (cache === undefined) {
            const getFailMessage: IOutgoingMessage = {
                status: false,
                type: message.type,
                value: `Called before initialization`,
            };
            process.send(getFailMessage);
        } else {
            cache.delete(message.param as string);
            const getSuccessMessage: IOutgoingMessage = {
                status: true,
                type: message.type,
                value: message.param as string,
            };
            process.send(getSuccessMessage);
        }
    }
});
