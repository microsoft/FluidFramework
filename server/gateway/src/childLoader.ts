/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { parse } from "url";
import { IFluidObject } from "@fluidframework/core-interfaces";
import { IProxyLoaderFactory } from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { Deferred } from "@fluidframework/common-utils";
import {
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { OdspDocumentServiceFactory } from "@fluidframework/odsp-driver";
import { ScopeType } from "@fluidframework/protocol-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { ContainerUrlResolver } from "@fluidframework/routerlicious-host";
import { NodeCodeLoader, NodeAllowList } from "@fluidframework/server-services";
import { promiseTimeout } from "@fluidframework/server-services-client";
import Axios from "axios";
import jwt from "jsonwebtoken";
import winston from "winston";

const installLocation = "/tmp/chaincode";
const waitTimeoutMS = 60000;

export interface IIncomingMessage {
    type: "init" | "get";

    param: any;
}

export interface IOutgoingMessage {
    type: "init" | "get";

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
                scopes: [ScopeType.DocRead],
                url: documentUrl,
            },
            {
                headers,
            });

        const documentServiceFactories: IDocumentServiceFactory[] = [];
        // TODO: figure out how to pass clientId and token here
        documentServiceFactories.push(new OdspDocumentServiceFactory(
            async () => Promise.resolve("fake token"),
            async () => Promise.resolve("fake token")));

        documentServiceFactories.push(new RouterliciousDocumentServiceFactory());

        const resolver = new ContainerUrlResolver(
            config.gatewayUrl,
            hostToken,
            new Map<string, IResolvedUrl>([[documentUrl, result.data]]));

        config.tokens = (result.data as IFluidResolvedUrl).tokens;

        const loader = new Loader(
            resolver,
            documentServiceFactories,
            new NodeCodeLoader(installLocation, waitTimeoutMS, new NodeAllowList()),
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
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.attach(loader, uri);
        container.on("contextChanged", (value) => {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.attach(loader, uri);
        });
    }

    private async attach(loader: Loader, docUrl: string) {
        const response = await loader.request({ url: docUrl });
        if (response.status !== 200 ||
            (response.mimeType !== "fluid/component" && response.mimeType !== "fluid/object")) {
            return;
        }
        const fluidObject = response.value as IFluidObject;
        const keyValue = (fluidObject.IFluidRouter as unknown) as IKeyValue;
        winston.info(`Resolved key-value Fluid object`);
        this.kvDeferred.resolve(keyValue);
    }
}

let cache: IKeyValue;

// TODO (mdaumi): Move this to comlink.
// eslint-disable-next-line @typescript-eslint/no-misused-promises
process.on("message", async (message: IIncomingMessage) => {
    // Throughout this handler, note that we can only get the message event if process.send is defined,
    // per Node documentation: https://nodejs.org/api/child_process.html
    // Once @types/node supports assertion type narrowing natively,
    // these checks could be replaced with the native assert:
    // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/42786

    if (message.type === "init") {
        const keyValueLoaderP = promiseTimeout(cacheLoadTimeoutMS, KeyValueLoader.load(message.param));
        const cacheP = keyValueLoaderP.then(async (keyValueLoader: KeyValueLoader) => {
            return keyValueLoader.cache;
        }, async (err) => {
            return Promise.reject(err);
        });
        cacheP.then((resolvedCache) => {
            cache = resolvedCache;
            const initSuccessMessage: IOutgoingMessage = {
                status: true,
                type: message.type,
            };
            if (process.send === undefined) {
                throw new Error("process.send should be defined if we got a message event");
            }
            process.send(initSuccessMessage);
        }, (err) => {
            const initFailMessage: IOutgoingMessage = {
                status: false,
                type: message.type,
                value: err,
            };
            if (process.send === undefined) {
                throw new Error("process.send should be defined if we got a message event");
            }
            process.send(initFailMessage);
        });
    } else {
        if (cache === undefined) {
            const getFailMessage: IOutgoingMessage = {
                status: false,
                type: message.type,
                value: `Called before initialization`,
            };
            if (process.send === undefined) {
                throw new Error("process.send should be defined if we got a message event");
            }
            process.send(getFailMessage);
        } else {
            const getSuccessMessage: IOutgoingMessage = {
                status: true,
                type: message.type,
                value: cache.get(message.param as string),
            };
            if (process.send === undefined) {
                throw new Error("process.send should be defined if we got a message event");
            }
            process.send(getSuccessMessage);
        }
    }
});
