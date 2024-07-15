/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannel,
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import { createSharedObjectKind } from "@fluidframework/shared-object-base/internal";

import { type ISharedMatrix, SharedMatrix as SharedMatrixClass } from "./matrix.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * {@link @fluidframework/datastore-definitions#IChannelFactory} for {@link ISharedMatrix}.
 * @legacy
 * @alpha
 * @deprecated - Use `SharedMatrix.getFactory` instead.
 */
export class SharedMatrixFactory implements IChannelFactory<ISharedMatrix> {
	public static Type = "https://graph.microsoft.com/types/sharedmatrix";

	public static readonly Attributes: IChannelAttributes = {
		type: SharedMatrixFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type(): string {
		return SharedMatrixFactory.Type;
	}

	public get attributes(): IChannelAttributes {
		return SharedMatrixFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<ISharedMatrix & IChannel> {
		const matrix = new SharedMatrixClass(runtime, id, attributes);
		await matrix.load(services);
		return matrix;
	}

	public create(document: IFluidDataStoreRuntime, id: string): ISharedMatrix & IChannel {
		const matrix = new SharedMatrixClass(document, id, this.attributes);
		matrix.initializeLocal();
		return matrix;
	}
}

/**
 * Entrypoint for {@link ISharedMatrix} creation.
 * @legacy
 * @alpha
 */
export const SharedMatrix = createSharedObjectKind<ISharedMatrix>(SharedMatrixFactory);

/**
 * Convenience alias for {@link ISharedMatrix}. Prefer to use {@link ISharedMatrix} when referring to
 * SharedMatrix as a type.
 * @legacy
 * @alpha
 * @privateRemarks
 * This alias is for legacy compat from when the SharedMatrix class was exported as public.
 */
// Changing this to `unknown` would be a breaking change.
// TODO: if possible, transition SharedMatrix to not use `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SharedMatrix<T = any> = ISharedMatrix<T>;
