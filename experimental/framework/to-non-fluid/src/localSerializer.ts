/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidSerializer, isSerializedHandle } from "@fluidframework/shared-object-base";
import { LocalHandle } from "./localHandle";
import { LocalRuntime } from "./localRuntime";

export class LocalSerializer implements IFluidSerializer {
	constructor(private readonly localRuntime: LocalRuntime) {}
	encode(value: any, bind: IFluidHandle) {
		throw new Error("Method not implemented.");
	}
	decode(input: any) {
		throw new Error("Method not implemented.");
	}
	stringify(value: any, bind: IFluidHandle): string {
		throw new Error("Method not implemented.");
	}
	public parse(input: string): any {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return JSON.parse(input, (key, value): any => this.decodeValue(value));
	}

	private readonly decodeValue = (value: any): any => {
		// If 'value' is a serialized IFluidHandle return the deserialized result.
		if (isSerializedHandle(value)) {
			const absolutePath = value.url;

			const parsedHandle = new LocalHandle(this.localRuntime, absolutePath);
			return parsedHandle;
		} else {
			return value;
		}
	};
}
