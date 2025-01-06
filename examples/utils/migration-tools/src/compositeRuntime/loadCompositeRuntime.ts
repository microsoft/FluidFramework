/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext, IRuntime } from "@fluidframework/container-definitions/legacy";
import {
	IContainerRuntimeOptions,
	loadContainerRuntime,
} from "@fluidframework/container-runtime/legacy";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";
import type { FluidObject } from "@fluidframework/core-interfaces";
import type {
	NamedFluidDataStoreRegistryEntries,
	NamedFluidDataStoreRegistryEntry2,
} from "@fluidframework/runtime-definitions/legacy";

import type { IEntryPointPiece } from "./interfaces.js";

// TODO: CompositeEntryPoint isn't really the right name - this is more like CompositeContainerCode?
/**
 * CompositeEntryPoint is a class that allows building up a container's contents as multiple distinct
 * pieces.  These pieces are then made available on the container's entryPoint (container.getEntryPoint()).
 * @alpha
 */
export class CompositeEntryPoint {
	private readonly _entryPointPieces: IEntryPointPiece[] = [];
	// TODO: Consider taking a "name" argument here, and don't include "name" on the IEntryPointPiece
	// Or maybe allow a default name from the piece but allow override here?
	/**
	 * Add a piece that will appear on the entry point.
	 */
	public readonly addEntryPointPiece = (entryPointPiece: IEntryPointPiece): void => {
		// TODO: Consider validating no conflicts (e.g. name already exists, registry entry collision)
		this._entryPointPieces.push(entryPointPiece);
	};

	/**
	 * Get the combined registry entries from all pieces.
	 */
	public get registryEntries(): NamedFluidDataStoreRegistryEntries {
		const registryEntries: NamedFluidDataStoreRegistryEntry2[] = [];
		for (const entryPointPiece of this._entryPointPieces) {
			registryEntries.push(...entryPointPiece.registryEntries);
		}
		return registryEntries;
	}

	/**
	 * Run all of the onCreate scripts of all pieces.
	 */
	public readonly onCreate = async (runtime: IContainerRuntime): Promise<void> => {
		for (const entryPointPiece of this._entryPointPieces) {
			await entryPointPiece.onCreate(runtime);
		}
	};

	/**
	 * Run all of the onLoad scripts of all pieces.
	 */
	public readonly onLoad = async (runtime: IContainerRuntime): Promise<void> => {
		for (const entryPointPiece of this._entryPointPieces) {
			await entryPointPiece.onLoad(runtime);
		}
	};

	/**
	 * Assemble and provide the entry point.  To be passed to the ContainerRuntime.
	 */
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
 * loadCompositeRuntime should be used in place of ContainerRuntime.loadRuntime() in your container runtime
 * factory to produce a runtime with the provided composite entryPoint.
 * @alpha
 */
export const loadCompositeRuntime = async (
	context: IContainerContext,
	existing: boolean,
	compositeEntryPoint: CompositeEntryPoint,
	runtimeOptions?: IContainerRuntimeOptions,
): Promise<IContainerRuntime & IRuntime> => {
	const runtime = await loadContainerRuntime({
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
