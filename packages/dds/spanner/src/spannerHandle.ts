/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedObject } from "@fluidframework/shared-object-base";
import { Spanner } from "./spanner";

/**
 * Represents a handle to a Spanner object. How handles will be attached needs to work in the original flow so this
 * handle was created to allow the Spanner to be attached and the Spanner's children to be bound. More testing is
 * needed to ensure this works.
 *
 * Potentially we could use the FluidObjectHandle, I don't know what implications this has as we have multiple child
 * SharedObjects in different attach states
 *
 * TOld - The type of the old object.
 * TNew - The type of the new object.
 */
export class SpannerHandle<TOld extends SharedObject, TNew extends SharedObject>
	implements IFluidHandle<Spanner<TOld, TNew>>
{
	public constructor(private readonly value: Spanner<TOld, TNew>) {}
	public get absolutePath(): string {
		return this.value.target.handle.absolutePath;
	}
	public get isAttached(): boolean {
		return this.value.target.handle.isAttached;
	}

	// Wasn't sure how attaching will work if this was a FluidObjectHandle. This will allow the Spanner to be attached
	public attachGraph(): void {
		return this.value.target.handle.attachGraph();
	}
	public async get(): Promise<Spanner<TOld, TNew>> {
		return this.value;
	}

	// Wasn't sure how attaching will work if this was a FluidObjectHandle. This will allow the Spanner's child to be bound
	public bind(handle: IFluidHandle): void {
		this.value.target.handle.bind(handle);
	}
	public get IFluidHandle(): IFluidHandle<Spanner<TOld, TNew>> {
		return this;
	}
}
