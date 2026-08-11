/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { requireAssignableTo } from "@fluidframework/build-tools";
import type { FluidMap } from "@fluidframework/core-interfaces/internal";

import type {
	FluidMapLegacy,
	IDirectory,
	IDirectoryBeta,
	ISharedMap,
	ISharedMapBeta,
} from "../../index.js";

declare type _iDirectoryBeta_to_fluidMapLegacy = requireAssignableTo<
	IDirectoryBeta,
	FluidMapLegacy<string, unknown>
>;
declare type _iSharedMapBeta_to_fluidMapLegacy = requireAssignableTo<
	ISharedMapBeta,
	FluidMapLegacy<string, unknown>
>;
declare type _iDirectory_to_map = requireAssignableTo<
	IDirectory,
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	Map<string, any>
>;
declare type _iSharedMap_to_map = requireAssignableTo<
	ISharedMap,
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	Map<string, any>
>;
declare type _iDirectoryBeta_to_fluidMap = requireAssignableTo<
	IDirectoryBeta,
	FluidMap<string, unknown>
>;
declare type _iSharedMapBeta_to_fluidMap = requireAssignableTo<
	ISharedMapBeta,
	FluidMap<string, unknown>
>;
declare type _iDirectoryBeta_to_map = requireAssignableTo<
	IDirectoryBeta,
	Map<string, unknown>
>;
declare type _iSharedMapBeta_to_map = requireAssignableTo<
	ISharedMapBeta,
	Map<string, unknown>
>;
