/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle, IFluidSerializer, IRequest, IResponse } from '@fluidframework/core-interfaces';

export class TestFluidSerializer implements IFluidSerializer {
	public constructor() {}

	public get IFluidSerializer() {
		return this;
	}

	public replaceHandles(value: any, bind: IFluidHandle): void {
		throw new Error('Method not implemented.');
	}

	public stringify(value: any, bind: IFluidHandle): string {
		return JSON.stringify(value);
	}

	public parse(value: string): unknown {
		return JSON.parse(value);
	}
}

export class TestFluidHandle implements IFluidHandle {
	public absolutePath;
	public isAttached;

	public get IFluidHandle(): IFluidHandle {
		return this;
	}

	public async get(): Promise<any> {
		throw new Error('Method not implemented.');
	}

	public bind(handle: IFluidHandle): void {
		throw new Error('Method not implemented.');
	}

	public attachGraph(): void {
		throw new Error('Method not implemented.');
	}

	public async resolveHandle(request: IRequest): Promise<IResponse> {
		throw new Error('Method not implemented.');
	}
}
