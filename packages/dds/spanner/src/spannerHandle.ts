/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedObject } from "@fluidframework/shared-object-base";
import { Spanner } from "./spanner";

/**
 * Represents a handle to a Spanner object.
 * TOld - The type of the old object.
 * TNew - The type of the new object.
 */
export class SpannerHandle<TOld extends SharedObject, TNew extends SharedObject>
	implements IFluidHandle<TOld | TNew>
{
	public constructor(private readonly value: Spanner<TOld, TNew>) {}
	public get absolutePath(): string {
		return this.value.target.handle.absolutePath;
	}
	public get isAttached(): boolean {
		return this.value.target.handle.isAttached;
	}
	public attachGraph(): void {
		return this.value.target.handle.attachGraph();
	}
	public async get(): Promise<TOld | TNew> {
		return (await this.value.target.handle.get()) as TOld | TNew;
	}
	public bind(handle: IFluidHandle): void {
		this.value.target.handle.bind(handle);
	}
	public get IFluidHandle(): IFluidHandle<TOld | TNew> {
		return this.value.target.handle.IFluidHandle as IFluidHandle<TOld | TNew>;
	}
}
