/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import { createSharedObjectKind } from "@fluidframework/shared-object-base/internal";

import { SharedCell as SharedCellClass } from "./cell.js";
import type { ISharedCell } from "./interfaces.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * {@link @fluidframework/datastore-definitions#IChannelFactory} for {@link ISharedCell}.
 *
 * @sealed
 *
 * @internal
 */
export class CellFactory implements IChannelFactory<ISharedCell> {
	/**
	 * {@inheritDoc CellFactory."type"}
	 */
	public static readonly Type = "https://graph.microsoft.com/types/cell";

	/**
	 * {@inheritDoc CellFactory.attributes}
	 */
	public static readonly Attributes: IChannelAttributes = {
		type: CellFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public get type(): string {
		return CellFactory.Type;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public get attributes(): IChannelAttributes {
		return CellFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<ISharedCell> {
		const cell = new SharedCellClass(id, runtime, attributes);
		await cell.load(services);
		return cell;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
	 */
	public create(document: IFluidDataStoreRuntime, id: string): ISharedCell {
		const cell = new SharedCellClass(id, document, this.attributes);
		cell.initializeLocal();
		return cell;
	}
}

/**
 * Entrypoint for {@link ISharedCell} creation.
 *
 * This does not control the type of the content of the cell:
 * it is up to the user of this to ensure the cell's content types align.
 * @internal
 */
export const SharedCell = createSharedObjectKind<ISharedCell>(CellFactory);
