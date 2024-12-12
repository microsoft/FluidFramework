/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext, IRuntime } from "@fluidframework/container-definitions/internal";
import {
	ContainerRuntime,
	IContainerRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject } from "@fluidframework/core-interfaces";
import type {
	NamedFluidDataStoreRegistryEntries,
	NamedFluidDataStoreRegistryEntry2,
} from "@fluidframework/runtime-definitions/internal";

import type { IEntryPointPiece } from "./interfaces.js";

// TODO: CompositeEntryPoint isn't really the right name - this is more like CompositeContainerContents
// or CompositeContainerCode?
/**
 * @alpha
 */
export class CompositeEntryPoint {
	private readonly _entryPointPieces: IEntryPointPiece[] = [];
	// TODO: Consider taking a "name" argument here, and don't include "name" on the IEntryPointPiece
	// Or maybe allow a default name from the piece but allow override here?
	public readonly addEntryPointPiece = (entryPointPiece: IEntryPointPiece): void => {
		// TODO: Consider validating no conflicts (e.g. name already exists, registry entry collision)
		this._entryPointPieces.push(entryPointPiece);
	};

	public get registryEntries(): NamedFluidDataStoreRegistryEntries {
		const registryEntries: NamedFluidDataStoreRegistryEntry2[] = [];
		for (const entryPointPiece of this._entryPointPieces) {
			registryEntries.push(...entryPointPiece.registryEntries);
		}
		return registryEntries;
	}

	public readonly onCreate = async (runtime: IContainerRuntime): Promise<void> => {
		for (const entryPointPiece of this._entryPointPieces) {
			await entryPointPiece.onCreate(runtime);
		}
	};

	public readonly onLoad = async (runtime: IContainerRuntime): Promise<void> => {
		for (const entryPointPiece of this._entryPointPieces) {
			await entryPointPiece.onLoad(runtime);
		}
	};

	public readonly provideEntryPoint = async (
		runtime: IContainerRuntime,
	): Promise<Record<string, FluidObject>> => {
		const entryPoint: Record<string, FluidObject> = {};
		for (const entryPointPiece of this._entryPointPieces) {
			entryPoint[entryPointPiece.name] = await entryPointPiece.createPiece(runtime);
		}
		return entryPoint;
	};
}

/**
 * TODO: Make lint happy
 * @alpha
 */
export const loadCompositeRuntime = async (
	context: IContainerContext,
	existing: boolean,
	compositeEntryPoint: CompositeEntryPoint,
	runtimeOptions?: IContainerRuntimeOptions,
): Promise<IContainerRuntime & IRuntime> => {
	const runtime = await ContainerRuntime.loadRuntime({
		context,
		registryEntries: compositeEntryPoint.registryEntries,
		provideEntryPoint: compositeEntryPoint.provideEntryPoint,
		runtimeOptions,
		existing,
	});

	if (!existing) {
		await compositeEntryPoint.onCreate(runtime);
	}
	await compositeEntryPoint.onLoad(runtime);

	return runtime;
};
