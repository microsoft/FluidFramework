/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import Delta from "quill-delta";

import { SharedOT } from "../index.js";

export class SharedDelta extends SharedOT<Delta, Delta> {
	public static create(runtime: IFluidDataStoreRuntime, id?: string): SharedDelta {
		return runtime.createChannel(id, DeltaFactory.Type) as SharedDelta;
	}

	public static getFactory(): DeltaFactory {
		return new DeltaFactory();
	}

	constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
		super(id, runtime, attributes, /* initialValue: */ new Delta());
	}

	public get delta(): Delta {
		return this.state;
	}

	public get text(): string {
		return this.state.reduce((s, delta) => {
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			return `${s}${delta.insert?.toString()}`;
		}, "");
	}

	public get length(): number {
		return this.text.length;
	}

	protected transform(input: Delta, transform: Delta): Delta {
		return new Delta(transform).transform(input, false);
	}

	protected applyCore(state: Delta, op: Delta): Delta {
		return state.compose(op);
	}

	public insert(position: number, text: string): void {
		this.apply(new Delta().retain(position).insert(text));
	}

	public delete(start: number, end: number): void {
		this.apply(new Delta().retain(start).delete(end - start));
	}
}

export class DeltaFactory implements IChannelFactory {
	public static Type = "@test/delta-factory";

	public static readonly Attributes: IChannelAttributes = {
		type: DeltaFactory.Type,
		snapshotFormatVersion: "test",
		packageVersion: "test",
	};

	public get type(): string {
		return DeltaFactory.Type;
	}
	public get attributes(): IChannelAttributes {
		return DeltaFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<SharedDelta> {
		const instance = new SharedDelta(id, runtime, attributes);
		await instance.load(services);
		return instance;
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): SharedDelta {
		const instance = new SharedDelta(id, runtime, this.attributes);
		instance.initializeLocal();
		return instance;
	}
}
