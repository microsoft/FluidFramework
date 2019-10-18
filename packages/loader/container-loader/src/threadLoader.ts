/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentRouter,
    IComponentRunnable,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { IFluidResolvedUrl } from "@microsoft/fluid-protocol-definitions";
import { ModuleThread, spawn, Worker } from "threads";

// tslint:disable interface-over-type-literal
type WorkerLoader = {
    setup(
        id: string,
        version: string | null | undefined,
        connection: string,
        options: any,
        request: IRequest,
        resolved: IFluidResolvedUrl,
        fromSequenceNumber: number,
        canReconnect: boolean): Promise<void>;
    load(): Promise<IResponse>;
    run(): Promise<void>
};

export class ThreadLoader {
    public static async load(
        id: string,
        version: string | null | undefined,
        connection: string,
        options: any,
        request: IRequest,
        resolved: IFluidResolvedUrl,
        fromSequenceNumber: number,
        canReconnect: boolean,
    ) {
        const worker = await spawn<WorkerLoader>(new Worker("/public/scripts/dist/worker.min.js"));
        await worker.setup(
            id,
            version,
            connection,
            options,
            request,
            resolved,
            fromSequenceNumber,
            canReconnect,
        );
        return new ThreadLoader(worker);
    }

    constructor(private readonly thread: ModuleThread<WorkerLoader>) {
    }

    public async request(): Promise<IResponse> {
        const response = await this.thread.load();
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            return response;
        }
        return { status: 200, mimeType: "fluid/component", value: new Runner(this.thread) };
    }
}

export class Runner implements IComponentRouter, IComponentRunnable {

    constructor(private readonly thread: ModuleThread<WorkerLoader>) {}

    public get IComponentRouter() { return this; }
    public get IComponentRunnable() { return this; }

    public async run(): Promise<void> {
        return this.thread.run();
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/component",
            status: 200,
            value: this,
        };
    }
}
