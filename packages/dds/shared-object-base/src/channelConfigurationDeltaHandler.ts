/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IChannelAttributes } from "@fluidframework/datastore-definitions/internal";
import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import {
	ChannelConfigurationController,
	type ChannelConfiguration,
	type ChannelConfigurationAttachedContext,
	type ChannelConfigurationDefinition,
} from "./channelConfiguration.js";
import type { ChannelConfigurationMessageV1 } from "./channelConfigurationFormat.js";
import type { SharedObjectTransport } from "./sharedObject.js";
import type { SharedObjectConfigurationOptions } from "./sharedObjectConfiguration.js";
import type {
	SharedKernelConfiguration,
	SharedKernelConfigurationFactory,
	SharedKernelConfigurationFactoryArgs,
} from "./sharedObjectKernel.js";

/**
 * State available before services are connected, without exposing the runtime or subclass hooks.
 */
export interface ChannelConfigurationHost {
	readonly attributes: IChannelAttributes;
	readonly logger: TelemetryLoggerExt;
	isDisposed(): boolean;
	isReadOnly(): boolean;
	onDispose(listener: () => void): void;
}

/**
 * Creates injected persisted-configuration support for a kernel-backed shared object.
 * @internal
 */
export function makeSharedKernelConfiguration<TConfig extends ChannelConfiguration>(
	definition: ChannelConfigurationDefinition<TConfig>,
	initialConfiguration?: TConfig,
): SharedKernelConfigurationFactory<TConfig> {
	return {
		channelConfigurationProtocolVersion: 1,
		create: (args) => makeConfiguredKernelSupport(definition, initialConfiguration, args),
	};
}

function makeConfiguredKernelSupport<TConfig extends ChannelConfiguration>(
	definition: ChannelConfigurationDefinition<TConfig>,
	initialConfiguration: TConfig | undefined,
	args: SharedKernelConfigurationFactoryArgs,
): SharedKernelConfiguration<TConfig> {
	const initialization: SharedObjectConfigurationOptions<TConfig>["initialization"] =
		args.initializationKind === "load"
			? { kind: "load" }
			: initialConfiguration === undefined
				? { kind: "create" }
				: { kind: "create", initialConfiguration };
	const handler = new ChannelConfigurationHandler(
		{ definition, initialization },
		args.transport,
		{
			attributes: args.attributes,
			logger: args.logger,
			isDisposed: args.isDisposed,
			isReadOnly: args.isReadOnly,
			onDispose: args.onDispose,
		},
	);
	handler.beginInitialization(args.initializationKind);
	return {
		configuration: handler.controller,
		initialConfigurationSource: handler.initialConfigurationSource,
		verifyCanSubmit: () => handler.verifyCanSubmit(),
		processMessage: (message, context, localOpMetadata) =>
			handler.processMessage(message, context, localOpMetadata),
		applyStashedOp: (message) => handler.applyStashedOp(message),
		reSubmit: (message, localOpMetadata) => handler.reSubmit(message, localOpMetadata),
		rollback: (localOpMetadata) => handler.rollback(localOpMetadata),
		completeInitialization: () => handler.completeInitialization(),
		close: (error) => handler.close(error),
	};
}

/**
 * Owns persisted configuration initialization, control operations, and disposal.
 */
class ChannelConfigurationHandler<TConfig extends ChannelConfiguration> {
	#initialized = false;
	readonly #initializationKind: "create" | "load";
	public readonly controller: ChannelConfigurationController<TConfig>;
	public readonly initialConfigurationSource: "explicit" | "default";

	public constructor(
		{ definition, initialization }: SharedObjectConfigurationOptions<TConfig>,
		private readonly transport: SharedObjectTransport,
		private readonly host: ChannelConfigurationHost,
	) {
		this.#initializationKind = initialization.kind;
		this.initialConfigurationSource =
			initialization.kind === "load"
				? "configuration" in host.attributes
					? "explicit"
					: "default"
				: initialization.initialConfiguration === undefined
					? "default"
					: "explicit";
		const controller = new ChannelConfigurationController({
			definition,
			snapshot:
				initialization.kind === "load" && "configuration" in host.attributes
					? host.attributes.configuration
					: {
							version: 1,
							revision: 0,
							values:
								initialization.kind === "create"
									? (initialization.initialConfiguration ?? definition.defaultConfiguration)
									: definition.defaultConfiguration,
						},
			isAttached: () => transport.isAttached(),
			verifyCanChange: () => {
				this.verifyCanSubmit();
				assert(
					this.#initialized,
					"Cannot change configuration during shared object initialization",
				);
				assert(!host.isReadOnly(), "Cannot change configuration on a read-only runtime");
			},
			submit: (message, metadata) => this.#submitControlMessage(message, metadata),
		});
		this.controller = controller;
		host.onDispose(() =>
			this.close(new Error("Runtime disposed with pending configuration changes")),
		);
	}

	public beginInitialization(kind: "create" | "load"): void {
		assert(
			this.#initializationKind === kind && !this.#initialized,
			"Shared object configuration initialization mode does not match its lifecycle",
		);
	}

	public completeInitialization(): void {
		this.#initialized = true;
	}

	public verifyCanSubmit(): void {
		this.transport.verifyNotClosed();
		assert(!this.host.isDisposed(), "Cannot submit to a disposed configured channel");
		assert(
			this.#initializationKind !== "load" || this.#initialized,
			"Cannot submit while loading configured shared object state",
		);
		this.controller.verifyCanSubmit();
	}

	#submitControlMessage(content: unknown, metadata: unknown): void {
		this.verifyCanSubmit();
		if (this.transport.isAttached()) {
			this.transport.submitMessage(this.transport.prepareMessage(content), metadata);
		}
	}

	public processMessage(
		message: ChannelConfigurationMessageV1,
		context: ChannelConfigurationAttachedContext,
		localOpMetadata: unknown,
	): void {
		this.transport.verifyNotClosed();
		this.controller.verifyCanSubmit();
		const result = this.controller.process(message, context, localOpMetadata);
		this.host.logger.sendTelemetryEvent({
			eventName: "ChannelConfiguration",
			status: result.status,
			source: result.source,
			protocolVersion: 1,
			configurationRevision: result.current.revision,
			...(result.source === "sequenced"
				? {
						sequenceNumber: result.sequenceNumber,
						clientSequenceNumber: result.clientSequenceNumber,
						messageIndex: result.messageIndex,
						local: result.local,
					}
				: {}),
		});
	}

	public applyStashedOp(message: ChannelConfigurationMessageV1): void {
		this.controller.applyStashedOp(message);
	}

	public reSubmit(message: ChannelConfigurationMessageV1, localOpMetadata: unknown): void {
		this.controller.reSubmit(message, localOpMetadata);
	}

	public rollback(localOpMetadata: unknown): void {
		this.controller.rollback(localOpMetadata);
	}

	public close(error: unknown): void {
		this.controller.dispose(error);
	}
}
