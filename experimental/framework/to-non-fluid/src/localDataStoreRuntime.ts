/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState, IAudience } from "@fluidframework/container-definitions";
import {
	IFluidHandleContext,
	IFluidHandle,
	FluidObject,
	IRequest,
	IResponse,
	IFluidRouter,
} from "@fluidframework/core-interfaces";
import {
	IChannel,
	IFluidDataStoreRuntime,
	IFluidDataStoreRuntimeEvents,
} from "@fluidframework/datastore-definitions";
import { IQuorumClients } from "@fluidframework/protocol-definitions";
import { TypedEventEmitter } from "@fluid-internal/client-utils";

export class LocalDataStoreRuntime
	extends TypedEventEmitter<IFluidDataStoreRuntimeEvents>
	implements IFluidDataStoreRuntime, IFluidHandleContext
{
	constructor(public readonly absolutePath: string, public readonly id: string) {
		super();
	}
	routeContext?: IFluidHandleContext | undefined;
	isAttached: boolean = false;
	attachGraph(): void {
		throw new Error("Method not implemented.");
	}
	public async resolveHandle(request: IRequest): Promise<IResponse> {
		throw new Error("Method not implemented.");
	}
	IFluidHandleContext: IFluidHandleContext = this;
	rootRoutingContext: IFluidHandleContext = this;
	channelsRoutingContext: IFluidHandleContext = this;
	objectsRoutingContext: IFluidHandleContext = this;
	options;
	deltaManager;
	clientId: string | undefined;
	connected: boolean = false;
	logger;
	attachState: AttachState = AttachState.Detached;
	idCompressor?;
	async getChannel(id: string): Promise<IChannel> {
		throw new Error("Method not implemented.");
	}
	ensureNoDataModelChanges<T>(callback: () => T): T {
		throw new Error("Method not implemented.");
	}
	createChannel(id: string | undefined, type: string): IChannel {
		throw new Error("Method not implemented.");
	}
	bindChannel(channel: IChannel): void {
		throw new Error("Method not implemented.");
	}
	async uploadBlob(
		blob: ArrayBufferLike,
		signal?: AbortSignal | undefined,
	): Promise<IFluidHandle<ArrayBufferLike>> {
		throw new Error("Method not implemented.");
	}
	submitSignal(type: string, content: any): void {
		throw new Error("Method not implemented.");
	}
	getQuorum(): IQuorumClients {
		throw new Error("Method not implemented.");
	}
	getAudience(): IAudience {
		throw new Error("Method not implemented.");
	}

	async waitAttached(): Promise<void> {
		throw new Error("Method not implemented.");
	}
	entryPoint?: IFluidHandle<FluidObject> | undefined;
	async request(request: IRequest): Promise<IResponse> {
		throw new Error("Method not implemented.");
	}
	IFluidRouter: IFluidRouter = this;
	disposed: boolean = false;
	dispose(error?: Error | undefined): void {
		throw new Error("Method not implemented.");
	}
	IFluidDataStoreRegistry?;
}
