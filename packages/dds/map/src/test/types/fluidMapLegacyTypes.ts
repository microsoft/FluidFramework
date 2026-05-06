/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidMapLegacy } from "@fluidframework/core-interfaces/legacy";

import type { IDirectory, IDirectoryBeta, ISharedMap, ISharedMapBeta } from "../../index.js";

type requireTrue<_X extends true> = true;
type isAssignableTo<Source, Destination> = [Source] extends [Destination] ? true : false;

declare type _iDirectoryBeta_to_fluidMapLegacy = requireTrue<
	isAssignableTo<IDirectoryBeta, FluidMapLegacy<string, unknown>>
>;
declare type _iSharedMapBeta_to_fluidMapLegacy = requireTrue<
	isAssignableTo<ISharedMapBeta, FluidMapLegacy<string, unknown>>
>;
declare type _iDirectory_to_map = requireTrue<
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	isAssignableTo<IDirectory, Map<string, any>>
>;
declare type _iSharedMap_to_map = requireTrue<
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	isAssignableTo<ISharedMap, Map<string, any>>
>;
declare type _iDirectoryBeta_to_map = requireTrue<
	isAssignableTo<IDirectoryBeta, Map<string, unknown>>
>;
declare type _iSharedMapBeta_to_map = requireTrue<
	isAssignableTo<ISharedMapBeta, Map<string, unknown>>
>;
