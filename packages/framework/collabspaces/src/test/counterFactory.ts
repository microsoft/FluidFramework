/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	CounterFactory as CounterFactoryBase,
	SharedCounter as SharedCounterBase,
} from "@fluidframework/counter";
import {
	type IFluidDataStoreRuntime,
	type IChannelAttributes,
} from "@fluidframework/datastore-definitions";
import { ICollabChannel } from "../contracts";

export { ISharedCounter } from "@fluidframework/counter";

export class SharedCounter extends SharedCounterBase implements ICollabChannel {
	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		initialValue: number,
	) {
		super(id, runtime, attributes);
		this._value = initialValue;
	}

	// TBD
	public get dirty(): boolean {
		return true;
	}

	// TBD
	public get lastSeqNumber(): number {
		return 0;
	}
}

export class CounterFactory extends CounterFactoryBase {
	public create2(
		document: IFluidDataStoreRuntime,
		id: string,
		initialValue: unknown,
	): ICollabChannel {
		const counter = new SharedCounter(id, document, this.attributes, initialValue as number);
		counter.initializeLocal();
		return counter;
	}
}
