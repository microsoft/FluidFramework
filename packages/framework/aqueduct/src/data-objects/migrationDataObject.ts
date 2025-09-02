/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type {
	IChannel,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import type { ISharedObject } from "@fluidframework/shared-object-base/internal";

import { PureDataObject } from "./pureDataObject.js";
import type { DataObjectTypes } from "./types.js";

/**
 * Descriptor for a candidate root/channel type the migration data object can probe for
 * or create when initializing.
 */
export interface RootDescriptor<T extends IChannel = IChannel> {
	id: string;
	// runtime type guard to validate a retrieved channel
	typeGuard: (ch: IChannel) => ch is T;
	// optional factory used to create the channel when initializing a new object
	create?: (runtime: IFluidDataStoreRuntime) => Promise<T> | T;
}

/**
 * ! TODO
 * @experimental
 * @legacy
 * @alpha
 */
export abstract class MigrationDataObject<
	I extends DataObjectTypes = DataObjectTypes,
> extends PureDataObject<I> {
	// The currently active model/channel and its descriptor, if discovered or created.
	#activeModel: { descriptor: RootDescriptor; channel: IChannel } | undefined;

	/**
	 * Probeable candidate roots the implementer expects for existing stores.
	 * The order defines probing priority.
	 */
	protected abstract get rootCandidates(): RootDescriptor[];

	/**
	 * Descriptor used to create the new root when initializing a non-existing store.
	 * If undefined, no root will be created by this base class.
	 */
	protected abstract get rootCreator(): RootDescriptor | undefined;

	/**
	 * Returns the active model descriptor and channel after initialization.
	 * Throws if initialization did not set a model.
	 */
	public getModel<T extends IChannel = IChannel>(): {
		descriptor: RootDescriptor<T>;
		root: T;
	} {
		assert(this.#activeModel !== undefined, "Expected an active model to be defined");
		return {
			descriptor: this.#activeModel.descriptor as RootDescriptor<T>,
			root: this.#activeModel.channel as unknown as T,
		};
	}

	private async refreshRoot(): Promise<void> {
		this.#activeModel = undefined;

		for (const desc of this.rootCandidates ?? []) {
			try {
				const channel = await this.runtime.getChannel(desc.id);
				if (desc.typeGuard(channel)) {
					this.#activeModel = { descriptor: desc, channel };
					return;
				}
			} catch {
				// channel not present or other error probing this id; continue to next candidate
			}
		}
	}

	public override async initializeInternal(existing: boolean): Promise<void> {
		if (existing) {
			await this.refreshRoot();
		} else {
			const creator = this.rootCreator;
			if (creator !== undefined) {
				const created = await creator.create?.(this.runtime);
				if (created !== undefined) {
					// bind to context if supported
					const maybeShared = created as unknown as ISharedObject;
					if (maybeShared.bindToContext !== undefined) {
						maybeShared.bindToContext();
					}
					this.#activeModel = { descriptor: creator, channel: created as unknown as IChannel };
				}
				// Note: implementer is responsible for populating initial content on the created channel
			}
		}

		await super.initializeInternal(existing);
	}

	// Backwards-compatibility helpers (optional for implementers):
	// Implementers may provide RootDescriptor helpers for common types like SharedTree/SharedDirectory
	// rather than implementing create/runtime probing themselves.
}
