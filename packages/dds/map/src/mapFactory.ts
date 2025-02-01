/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createSharedObjectKind,
	makeChannelFactory,
	type ISharedObject,
	type SharedKernelFactory,
} from "@fluidframework/shared-object-base/internal";

import type { ISharedMap, ISharedMapCore } from "./interfaces.js";
import { mapKernelFactory } from "./mapKernel.js";
import { pkgVersion } from "./packageVersion.js";

const type = "https://graph.microsoft.com/types/map";

// Type testing to ensure kernel and dds types line up correctly.
// This is needed to ensure cast below on mapKernelFactory doesn't hide other type errors.
{
	type KernelType = Omit<ISharedMap, keyof ISharedObject>;

	const x = 0 as unknown as ISharedMapCore;
	// @ts-expect-error This return value on `set` causes an issue
	const _withSet: KernelType = x;
	// With `set` removed, confirm everything else type checks.
	const _withoutSet: Omit<KernelType, "set"> = x;
}

/**
 * {@link @fluidframework/datastore-definitions#IChannelFactory} for {@link ISharedMap}.
 * @privateRemarks
 * The clean way to export this is to do `class MapFactory extends ...` but that hits https://github.com/microsoft/rushstack/issues/4429.
 * TODO: this should not even be exposed: `makeSharedObjectKind` should be used instead.
 * @sealed
 * @legacy
 * @alpha
 */
export const MapFactory = makeChannelFactory<ISharedMap>({
	type,
	attributes: {
		type,
		snapshotFormatVersion: "0.2",
		packageVersion: pkgVersion,
	},
	telemetryContextPrefix: "fluid_map_",
	// This cast is used only to fix the return type of `.set` to be the desired `this` type.
	// THe use of `thisWrap` makes this work at runtime.
	factory: mapKernelFactory as SharedKernelFactory<ISharedMap>,
});
/**
 * {@inheritdoc (MapFactory:variable)}
 * @sealed
 * @legacy
 * @alpha
 */
export type MapFactory = InstanceType<typeof MapFactory>;

/**
 * Entrypoint for {@link ISharedMap} creation.
 * @legacy
 * @alpha
 */
export const SharedMap = createSharedObjectKind<ISharedMap>(MapFactory);

/**
 * Entrypoint for {@link ISharedMap} creation.
 * @legacy
 * @alpha
 * @privateRemarks
 * This alias is for legacy compat from when the SharedMap class was exported as public.
 */
export type SharedMap = ISharedMap;
