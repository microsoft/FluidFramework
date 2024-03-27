/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandleErased, IFluidHandleInternal } from '@fluidframework/core-interfaces';
import {
	IFluidHandle,
	IRequest,
	IResponse,
	fluidHandleSymbol,
	toFluidHandleErased,
} from '@fluidframework/core-interfaces';
import { IFluidSerializer } from '@fluidframework/shared-object-base';

export class TestFluidSerializer implements IFluidSerializer {
	public constructor() {}

	public get IFluidSerializer() {
		return this;
	}

	public encode(value: any, bind: IFluidHandle): void {
		throw new Error('Method not implemented.');
	}

	public decode(input: any): any {
		throw new Error('Method not implemented.');
	}

	public stringify(value: any, bind: IFluidHandle): string {
		return JSON.stringify(value);
	}

	public parse(value: string): unknown {
		return JSON.parse(value);
	}
}

export class TestFluidHandle implements IFluidHandleInternal {
	public absolutePath;
	public isAttached;

	public get IFluidHandle(): IFluidHandleInternal {
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

	public get [fluidHandleSymbol](): IFluidHandleErased<unknown> {
		return toFluidHandleErased(this);
	}
}
