/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ILayerCompatDetails } from "@fluid-internal/client-utils";
import { checkLayerCompatibility, createEmitter } from "@fluid-internal/client-utils";
import type { IAudience } from "@fluidframework/container-definitions";
import type {
	ContainerExtensionFactory,
	ContainerExtensionId,
	ExtensionHost,
	ExtensionHostEvents,
	ExtensionInstantiationResult,
	ExtensionRuntimeProperties,
	JoinedStatus,
	OutboundExtensionMessage,
} from "@fluidframework/container-runtime-definitions/internal";
import type { Listenable, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type { IEmitter, TypedMessage } from "@fluidframework/core-interfaces/internal";
import { Lazy } from "@fluidframework/core-utils/internal";
import type { IQuorumClients } from "@fluidframework/driver-definitions";
import type {
	ContainerExtensionExpectations,
	IInboundSignalMessage,
} from "@fluidframework/runtime-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { gt } from "semver-ts";

import { runtimeCoreCompatDetails } from "./runtimeLayerCompatState.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- required so typed factory is assignable per ContainerExtension.processSignal
type ExtensionEntry = ExtensionInstantiationResult<unknown, any, unknown[]>;

/**
 * Layer-compat details exposed to extensions.
 *
 * @internal
 */
export const containerRuntimeCompatDetailsForContainerExtensions = {
	...runtimeCoreCompatDetails,
	/** Features supported by the ContainerRuntime's ContainerExtensionStore implementation. */
	supportedFeatures: new Set<string>(),
} as const satisfies ILayerCompatDetails;

/**
 * Hooks the ExtensionsManager needs from the runtime to instantiate
 * extensions and to bridge runtime connection events into the host's event
 * emitter. Pass once at construction.
 *
 * @internal
 */
export interface IExtensionsManagerHost {
	readonly signalAudience: { getSelf(): { clientId?: string } | undefined } | undefined;
	readonly clientIdFallback: () => string | undefined;
	readonly getJoinedStatus: () => JoinedStatus;
	readonly logger: ITelemetryBaseLogger;
	readonly submitExtensionSignal: <TMessage extends TypedMessage>(
		id: string,
		addressChain: string[],
		message: OutboundExtensionMessage<TMessage>,
	) => void;
	readonly getQuorum: () => IQuorumClients;
	readonly getAudience: () => IAudience;
	/**
	 * Subscribe runtime events to the events emitter passed in. Called once,
	 * the first time an extension is acquired.
	 */
	readonly bindRuntimeEvents: (
		emitter: Listenable<ExtensionHostEvents> & IEmitter<ExtensionHostEvents>,
	) => void;
}

/**
 * Owns the {@link ContainerExtension} store: caches extensions by id, wires
 * an {@link ExtensionHost} for each new instantiation, and reconciles
 * version/capability mismatches when an existing instance is reacquired.
 *
 * Extracted from ContainerRuntime so the runtime stays focused on the runtime
 * pipeline rather than this purpose-built plugin store.
 *
 * @internal
 */
export class ExtensionsManager {
	private readonly extensions = new Map<ContainerExtensionId, ExtensionEntry>();

	// Lazily wired the first time an extension is acquired.
	private readonly lazyEvents = new Lazy<Listenable<ExtensionHostEvents>>(() => {
		const emitter = createEmitter<ExtensionHostEvents>();
		this.host.bindRuntimeEvents(emitter);
		return emitter;
	});

	constructor(private readonly host: IExtensionsManagerHost) {}

	/**
	 * Look up an extension entry by id. Used by the runtime's signal-routing
	 * path: `processSignal` checks for `/ext/<id>/...` addressed signals and
	 * forwards them to the matching extension's processSignal handler.
	 */
	public processSignal(
		id: ContainerExtensionId,
		addresses: string[],
		signalMessage: IInboundSignalMessage,
		local: boolean,
	): boolean {
		const entry = this.extensions.get(id);
		if (entry === undefined) {
			return false;
		}
		// `IInboundSignalMessage<TypedMessage>` is the runtime's type; the
		// extension factory narrows it to `InboundExtensionMessage<TRuntimeProperties["SignalMessages"]>`.
		// Cast through `any` once at this seam.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- ExtensionEntry's runtime properties widen to `any`; signal types bridge through
		entry.extension.processSignal?.(addresses, signalMessage as any, local);
		return true;
	}

	public acquireExtension<
		T,
		TRuntimeProperties extends ExtensionRuntimeProperties,
		TUseContext extends unknown[],
	>(
		id: ContainerExtensionId,
		factory: ContainerExtensionFactory<T, TRuntimeProperties, TUseContext>,
		...useContext: TUseContext
	): T {
		return this.acquireInternal(/* injectionPermitted */ true, id, factory, ...useContext);
	}

	public getExtension<
		T,
		TRuntimeProperties extends ExtensionRuntimeProperties,
		TUseContext extends unknown[],
	>(
		id: ContainerExtensionId,
		requirements: ContainerExtensionExpectations,
		...useContext: TUseContext
	): T {
		// Temporarily allow injection for extensions; `requirements` doubles as a factory.
		return this.acquireInternal(
			/* injectionPermitted */ true,
			id,
			requirements as ContainerExtensionFactory<T, TRuntimeProperties, TUseContext>,
			...useContext,
		);
	}

	private acquireInternal<
		T,
		TRuntimeProperties extends ExtensionRuntimeProperties,
		TUseContext extends unknown[],
	>(
		injectionPermitted: boolean,
		id: ContainerExtensionId,
		factory: ContainerExtensionFactory<T, TRuntimeProperties, TUseContext>,
		...useContext: TUseContext
	): T {
		const compatCheckResult = checkLayerCompatibility(
			factory.hostRequirements,
			containerRuntimeCompatDetailsForContainerExtensions,
		);
		if (!compatCheckResult.isCompatible) {
			throw new UsageError("Extension is not compatible with ContainerRuntime", {
				errorDetails: JSON.stringify({
					containerRuntimeVersion:
						containerRuntimeCompatDetailsForContainerExtensions.pkgVersion,
					containerRuntimeGeneration:
						containerRuntimeCompatDetailsForContainerExtensions.generation,
					minSupportedGeneration: factory.hostRequirements.minSupportedGeneration,
					isGenerationCompatible: compatCheckResult.isGenerationCompatible,
					unsupportedFeatures: compatCheckResult.unsupportedFeatures,
				}),
			});
		}

		let entry = this.extensions.get(id);
		if (entry === undefined) {
			if (!injectionPermitted) {
				throw new Error(`Extension ${id} not found`);
			}

			const audience = this.host.signalAudience;
			const runtime = {
				getJoinedStatus: this.host.getJoinedStatus,
				getClientId: audience
					? () => audience.getSelf()?.clientId
					: this.host.clientIdFallback,
				events: this.lazyEvents.value,
				logger: this.host.logger,
				submitAddressedSignal: (
					addressChain: string[],
					message: OutboundExtensionMessage<TRuntimeProperties["SignalMessages"]>,
				) => {
					this.host.submitExtensionSignal(id, addressChain, message);
				},
				getQuorum: this.host.getQuorum,
				getAudience: audience ? () => audience as unknown as IAudience : this.host.getAudience,
				supportedFeatures:
					containerRuntimeCompatDetailsForContainerExtensions.supportedFeatures,
			} satisfies ExtensionHost<TRuntimeProperties>;
			entry = factory.instantiateExtension(runtime, ...useContext);
			this.extensions.set(id, entry);
		} else {
			const { extension, compatibility } = entry;
			if (
				// Re-use only if same instance; otherwise validate version+capabilities.
				!(entry instanceof factory) &&
				(compatibility.version !== factory.instanceExpectations.version ||
					[...factory.instanceExpectations.capabilities].some(
						(cap) => !compatibility.capabilities.has(cap),
					))
			) {
				// eslint-disable-next-line unicorn/prefer-ternary -- operations are significant and deserve own blocks
				if (
					!injectionPermitted ||
					gt(compatibility.version, factory.instanceExpectations.version)
				) {
					// Older or injection-disallowed: defer to the existing extension to handle.
					entry = extension.handleVersionOrCapabilitiesMismatch(
						entry,
						factory.instanceExpectations,
					);
				} else {
					// Newer or more capable: replace the existing entry.
					entry = factory.resolvePriorInstantiation(entry);
				}
			}
			entry.extension.onNewUse(...useContext);
		}
		return entry.interface as T;
	}
}
