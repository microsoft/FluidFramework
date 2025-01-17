/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import { FluidObject } from "@fluidframework/core-interfaces";
import { type IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	AliasResult,
	IDataStore,
	IFluidDataStoreChannel,
} from "@fluidframework/runtime-definitions/internal";
import {
	ITelemetryLoggerExt,
	TelemetryDataTag,
	UsageError,
} from "@fluidframework/telemetry-utils/internal";

import { ChannelCollection } from "./channelCollection.js";
// eslint-disable-next-line import/no-deprecated
import { ContainerMessageType } from "./messageTypes.js";

/**
 * Interface for an op to be used for assigning an
 * alias to a datastore
 */
export interface IDataStoreAliasMessage {
	/**
	 * The internal id of the datastore
	 */
	readonly internalId: string;
	/**
	 * The alias name to be assigned to the datastore
	 */
	readonly alias: string;
}

/**
 * Type guard that returns true if the given alias message is actually an instance of
 * a class which implements {@link IDataStoreAliasMessage}
 * @param maybeDataStoreAliasMessage - message object to be validated
 * @returns True if the {@link IDataStoreAliasMessage} is fully implemented, false otherwise
 */
export const isDataStoreAliasMessage = (
	maybeDataStoreAliasMessage: unknown,
): maybeDataStoreAliasMessage is IDataStoreAliasMessage => {
	return (
		typeof (maybeDataStoreAliasMessage as Partial<IDataStoreAliasMessage>)?.internalId ===
			"string" &&
		typeof (maybeDataStoreAliasMessage as Partial<IDataStoreAliasMessage>)?.alias === "string"
	);
};

export const channelToDataStore = (
	fluidDataStoreChannel: IFluidDataStoreChannel,
	internalId: string,
	channelCollection: ChannelCollection,
	logger: ITelemetryLoggerExt,
): IDataStore => new DataStore(fluidDataStoreChannel, internalId, channelCollection, logger);

enum AliasState {
	Aliased = "Aliased",
	Aliasing = "Aliasing",
	None = "None",
}

class DataStore implements IDataStore {
	private aliasState: AliasState = AliasState.None;
	private alias: string | undefined;
	private readonly pendingAliases: Map<string, Promise<AliasResult>>;
	private aliasResult: Promise<AliasResult> | undefined;

	/**
	 * {@inheritDoc @fluidframework/runtime-definitions#IDataStore.trySetAlias}
	 */
	async trySetAlias(alias: string): Promise<AliasResult> {
		if (alias.includes("/")) {
			throw new UsageError(`The alias cannot contain slashes: '${alias}'`);
		}

		switch (this.aliasState) {
			// If we're already aliasing, check if it's for the same value and return
			// the stored promise, otherwise return 'AlreadyAliased'
			case AliasState.Aliasing:
				assert(
					this.aliasResult !== undefined,
					0x316 /* There should be a cached promise of in-progress aliasing */,
				);
				await this.aliasResult;
				return this.alias === alias ? "Success" : "AlreadyAliased";

			// If this datastore is already aliased, return true only if this
			// is a repeated call for the same alias
			case AliasState.Aliased:
				return this.alias === alias ? "Success" : "AlreadyAliased";

			case AliasState.None: {
				const existingAlias = this.pendingAliases.get(alias);
				if (existingAlias !== undefined) {
					// There is already another datastore which will be aliased
					// to the same name
					return "Conflict";
				}

				// There is no current or past alias operation for this datastore,
				// or for this alias, so it is safe to continue execution
				break;
			}

			default:
				unreachableCase(this.aliasState);
		}

		this.aliasState = AliasState.Aliasing;
		this.aliasResult = this.trySetAliasInternal(alias);
		this.pendingAliases.set(alias, this.aliasResult);
		return this.aliasResult;
	}

	async trySetAliasInternal(alias: string): Promise<AliasResult> {
		const message: IDataStoreAliasMessage = {
			internalId: this.internalId,
			alias,
		};
		this.fluidDataStoreChannel.makeVisibleAndAttachGraph();

		if (this.parentContext.attachState === AttachState.Detached) {
			const localResult = this.channelCollection.processAliasMessageCore(
				this.internalId,
				alias,
			);
			// Explicitly lock-out future attempts of aliasing,
			// regardless of result
			this.aliasState = AliasState.Aliased;
			return localResult ? "Success" : "Conflict";
		}

		const aliased = await this.ackBasedPromise<boolean>((resolve) => {
			// eslint-disable-next-line import/no-deprecated
			this.parentContext.submitMessage(ContainerMessageType.Alias, message, resolve);
		})
			.catch((error) => {
				this.logger.sendErrorEvent(
					{
						eventName: "AliasingException",
						alias: {
							value: alias,
							tag: TelemetryDataTag.UserData,
						},
						internalId: {
							value: this.internalId,
							tag: TelemetryDataTag.CodeArtifact,
						},
					},
					error,
				);

				return false;
			})
			.finally(() => {
				this.pendingAliases.delete(alias);
			});

		if (!aliased) {
			this.aliasState = AliasState.None;
			this.aliasResult = undefined;
			return "Conflict";
		}

		this.alias = alias;
		this.aliasState = AliasState.Aliased;
		return "Success";
	}

	/**
	 * {@inheritDoc @fluidframework/runtime-definitions#IDataStore.entryPoint}
	 */
	get entryPoint(): IFluidHandleInternal<FluidObject> {
		return this.fluidDataStoreChannel.entryPoint;
	}

	constructor(
		private readonly fluidDataStoreChannel: IFluidDataStoreChannel,
		private readonly internalId: string,
		private readonly channelCollection: ChannelCollection,
		private readonly logger: ITelemetryLoggerExt,
		private readonly parentContext = channelCollection.parentContext,
	) {
		this.pendingAliases = channelCollection.pendingAliases;
	}

	private async ackBasedPromise<T>(
		executor: (
			resolve: (value: T | PromiseLike<T>) => void,
			reject: (reason?: unknown) => void,
		) => void,
	): Promise<T> {
		let rejectBecauseDispose: () => void;
		return new Promise<T>((resolve, reject) => {
			rejectBecauseDispose = () =>
				reject(
					new Error("ContainerRuntime disposed while this ack-based Promise was pending"),
				);

			if (this.parentContext.containerRuntime.disposed) {
				rejectBecauseDispose();
				return;
			}

			this.parentContext.containerRuntime.on("dispose", rejectBecauseDispose);
			executor(resolve, reject);
		}).finally(() => {
			this.parentContext.containerRuntime.off("dispose", rejectBecauseDispose);
		});
	}
}
