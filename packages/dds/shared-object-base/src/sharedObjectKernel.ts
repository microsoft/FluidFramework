/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import { assert, fail } from "@fluidframework/core-utils/internal";
import type {
	IChannelStorageService,
	IChannel,
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IFluidDataStoreRuntime,
	IFluidDataStoreRuntimeInternalConfig,
	ChannelConfigurationRuntime,
} from "@fluidframework/datastore-definitions/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor/internal";
import type {
	ISummaryTreeWithStats,
	ITelemetryContext,
	IExperimentalIncrementalSummaryContext,
	IRuntimeMessageCollection,
	IRuntimeMessagesContent,
	OldestSupportedClientVersion,
} from "@fluidframework/runtime-definitions/internal";
import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";
import {
	extractTelemetryLoggerExt,
	UsageError,
} from "@fluidframework/telemetry-utils/internal";

import {
	ChannelConfigurationController,
	type ChannelConfiguration,
	type ChannelConfigurationDefinition,
	type ChannelConfigurationFacet,
} from "./channelConfiguration.js";
import { ConfiguredKernelProtocol } from "./configuredKernelProtocol.js";
import type { IFluidSerializer } from "./serializer.js";
import {
	createSharedObjectKindAlpha,
	SharedObject,
	type ISharedObjectKind,
	type SharedObjectKindAlpha,
} from "./sharedObject.js";
import { sharedObjectProtocols } from "./sharedObjectProtocol.js";
import type { ISharedObjectEvents, ISharedObject } from "./types.js";
import type { IChannelView } from "./utils.js";

/**
 * Functionality specific to a particular kind of {@link ISharedObject}.
 * @remarks
 * Shared objects expose APIs for two consumers:
 *
 * 1. The runtime, which uses {@link @fluidframework/datastore-definitions#IChannel} to summarize and apply ops and {@link @fluidframework/datastore-definitions#IChannelFactory} to create the load summaries.
 *
 * 2. The app, which uses shared object kind specific APIs to read and write data.
 *
 * There is some common functionality all shared objects use, provided by {@link SharedObject} and {@link SharedObjectCore}.
 * SharedKernel describes the portion of the behavior required by the runtime which
 * differs between different kinds of shared objects.
 *
 * {@link makeSharedObjectKind} is then used to wrap up the kernel into a full {@link ISharedObject} implementation.
 * The runtime specific APIs are then type erased into a {@link SharedObjectKind}.
 * @privateRemarks
 * Unlike the `SharedObject` class, this interface is internal, and thus can be adjusted more easily.
 * Therefore this interface is not intended to address all needs, and will likely need small changes as it gets more adoption.
 *
 * @internal
 */
export interface SharedKernel {
	/**
	 * {@inheritDoc SharedObject.summarizeCore}
	 */
	summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext: ITelemetryContext | undefined,
		incrementalSummaryContext: IExperimentalIncrementalSummaryContext | undefined,
		fullTree?: boolean,
	): ISummaryTreeWithStats;

	/**
	 * {@inheritDoc SharedObjectCore.onDisconnect}
	 */
	onDisconnect(): void;

	/**
	 * {@inheritDoc SharedObjectCore.reSubmitCore}
	 */
	reSubmitCore(content: unknown, localOpMetadata: unknown): void;

	/**
	 * {@inheritDoc SharedObjectCore.applyStashedOp}
	 */
	applyStashedOp(content: unknown): void;

	/**
	 * {@inheritDoc SharedObjectCore.processMessagesCore}
	 */
	processMessagesCore(messagesCollection: SharedKernelMessageCollection): void;

	/**
	 * {@inheritDoc SharedObjectCore.rollback}
	 */
	rollback?(content: unknown, localOpMetadata: unknown): void;

	/**
	 * {@inheritDoc SharedObjectCore.didAttach}
	 */
	didAttach?(): void;
}

/**
 * Ordinary kernel messages, with original submission provenance on configured channels.
 * A message from an earlier revision is still delivered normally.
 * @internal
 */
export type SharedKernelMessageCollection = Omit<
	IRuntimeMessageCollection,
	"messagesContent"
> & {
	readonly messagesContent: readonly (IRuntimeMessagesContent & {
		readonly configurationRevision?: number;
	})[];
};

/**
 * SharedObject implementation that delegates to a SharedKernel.
 * @typeParam TOut - The type of the object exposed to the app.
 * Once initialized, instances of this class forward properties to the `TOut` value provided by the factory.
 * See {@link mergeAPIs} for more limitations.
 *
 * @remarks
 * The App facing API (TOut) needs to be implemented by this object which also has to implement the runtime facing API (ISharedObject).
 *
 * Requiring both of these to be implemented by the same object adds some otherwise unnecessary coupling.
 * This class is a workaround for that, which takes separate implementations of the two APIs and merges them into one using {@link mergeAPIs}.
 */
class SharedObjectFromKernel<
	TOut extends object,
	TEvent extends ISharedObjectEvents,
	TConfig extends ChannelConfiguration,
> extends SharedObject<TEvent> {
	/**
	 * Lazy init here so kernel can be constructed in loadCore when loading from existing data.
	 *
	 * Explicit initialization to undefined is done so Proxy knows this property is from this class (via `Reflect.has`),
	 * not from the grafted APIs.
	 */
	#lazyData: FactoryOut<TOut> | undefined = undefined;

	readonly #kernelArgs: KernelArgs<TConfig>;
	readonly #configurationProtocol: ConfiguredKernelProtocol<TConfig> | undefined;
	#initializingConfiguration = true;
	readonly #loadingConfiguration: boolean;

	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		public readonly factory: SharedKernelFactory<TOut, TConfig>,
		telemetryContextPrefix: string,
		source:
			| { readonly initialConfiguration: TConfig }
			| { readonly snapshot: unknown }
			| undefined,
	) {
		super(
			id,
			runtime,
			source === undefined ? attributes : { ...attributes },
			telemetryContextPrefix,
		);

		this.#loadingConfiguration = source !== undefined && "snapshot" in source;
		if (source !== undefined) {
			const definition = factory.configurationDefinition;
			if (definition === undefined) {
				throw new UsageError("Factory does not support channel configuration");
			}
			const controller = new ChannelConfigurationController({
				definition,
				source: this.#loadingConfiguration ? "load" : "create",
				snapshot:
					"snapshot" in source
						? source.snapshot
						: { version: 1, revision: 0, values: source.initialConfiguration },
				isAttached: () => this.isAttached(),
				verifyCanChange: () => {
					this.#verifyConfigurationSubmission();
					if (this.#initializingConfiguration) {
						throw new UsageError("Cannot change configuration during kernel initialization");
					}
					if (runtime.isReadOnly()) {
						throw new UsageError("Cannot change configuration on a read-only runtime");
					}
				},
				submit: (message, metadata) => {
					assert(
						this.#configurationProtocol !== undefined,
						"Configuration protocol must be initialized",
					);
					this.#configurationProtocol.submitControl(message, metadata);
				},
				maxMessageSize: () => this.deltaManager.maxMessageSize,
			});
			this.#configurationProtocol = new ConfiguredKernelProtocol(
				controller,
				(content, metadata) => this.submitLocalMessage(content, metadata),
				() => this.#verifyConfigurationSubmission(),
				(result) =>
					extractTelemetryLoggerExt(this.logger).sendTelemetryEvent({
						eventName: "ChannelConfiguration",
						status: result.status,
						source: result.source,
						protocolVersion: result.current.version,
						configurationRevision: result.current.revision,
						...(result.source === "sequenced"
							? {
									sequenceNumber: result.sequenceNumber,
									clientSequenceNumber: result.clientSequenceNumber,
									messageIndex: result.messageIndex,
									local: result.local,
								}
							: {}),
					}),
			);
			sharedObjectProtocols.set(this, this.#configurationProtocol);
			Object.defineProperty(this.attributes, "configuration", {
				enumerable: true,
				get: () => controller.current,
			});
			Object.freeze(this.attributes);
			runtime.once("dispose", () =>
				this.#configurationProtocol?.close(
					new UsageError("Runtime disposed with pending configuration changes"),
				),
			);
		}

		// This cast is needed since IFluidDataStoreRuntimeInternalConfig does not extend IFluidDataStoreRuntime directly. This pattern
		// allows us to avoid breaking changes to IFluidDataStoreRuntime by hiding internal members in a separate interface, but comes
		// at the cost of less compile-time enforcement. For example, if the runtime did not implement `minVersionForCollab` and the
		// member was still optional (e.g., during the deprecation window where backwards-compatibility is maintained), the compiler
		// would emit an error.
		const minVersionForCollab: OldestSupportedClientVersion | undefined = (
			runtime as IFluidDataStoreRuntimeInternalConfig
		).minVersionForCollab;

		assert(minVersionForCollab !== undefined, 0xcee /* minVersionForCollab must be defined */);

		this.#kernelArgs = {
			sharedObject: this,
			serializer: this.serializer,
			submitLocalMessage: (op, localOpMetadata) =>
				this.submitLocalMessage(op, localOpMetadata),
			eventEmitter: this,
			logger: extractTelemetryLoggerExt(this.logger),
			idCompressor: runtime.idCompressor,
			lastSequenceNumber: () => this.deltaManager.lastSequenceNumber,
			initialSequenceNumber: this.deltaManager.initialSequenceNumber,
			minVersionForCollab,
			...(this.#configurationProtocol === undefined
				? {}
				: { configuration: this.#configurationProtocol.controller }),
		};
	}

	public get channelConfigurationProtocolVersion(): 1 | undefined {
		return this.#configurationProtocol === undefined ? undefined : 1;
	}

	#verifyConfigurationSubmission(): void {
		if (this.runtime.disposed) {
			throw new UsageError("Cannot submit to a disposed configured channel");
		}
		if (this.#loadingConfiguration && this.#initializingConfiguration) {
			throw new UsageError("Cannot submit while loading configured kernel state");
		}
		this.#configurationProtocol?.controller.verifyCanSubmit();
	}

	protected override summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
		fullTree?: boolean,
	): ISummaryTreeWithStats {
		return this.#kernel.summarizeCore(
			serializer,
			telemetryContext,
			incrementalSummaryContext,
			fullTree,
		);
	}

	protected override initializeLocalCore(): void {
		this.#initializeData(this.factory.create(this.#kernelArgs));
		this.#initializingConfiguration = false;
	}

	#initializeData(data: FactoryOut<TOut>): void {
		assert(
			this.#lazyData === undefined,
			0xb99 /* initializeData must be called first and only once */,
		);
		this.#lazyData = data;

		// Make `this` implement TOut.
		mergeAPIs(this, data.view);
	}

	get #kernel(): SharedKernel {
		return (this.#lazyData ?? fail(0xcb0 /* must initializeData first */)).kernel;
	}

	protected override async loadCore(storage: IChannelStorageService): Promise<void> {
		this.#initializeData(await this.factory.loadCore(this.#kernelArgs, storage));
		this.#initializingConfiguration = false;
	}

	protected override onDisconnect(): void {
		this.#kernel.onDisconnect();
	}

	protected override reSubmitCore(content: unknown, localOpMetadata: unknown): void {
		this.#kernel.reSubmitCore(content, localOpMetadata);
	}

	protected override applyStashedOp(content: unknown): void {
		this.#kernel.applyStashedOp(content);
	}

	protected override processMessagesCore(messagesCollection: IRuntimeMessageCollection): void {
		this.#kernel.processMessagesCore(messagesCollection);
	}

	protected override rollback(content: unknown, localOpMetadata: unknown): void {
		if (this.#kernel.rollback === undefined) {
			super.rollback(content, localOpMetadata);
		} else {
			this.#kernel.rollback(content, localOpMetadata);
		}
	}

	protected override didAttach(): void {
		if (
			this.#configurationProtocol !== undefined &&
			(this.runtime as ChannelConfigurationRuntime).isChannelConfigurationEnabled?.(
				this.attributes.type,
			) !== true
		) {
			throw new UsageError(
				"Channel configuration document capability is not enabled for this type",
			);
		}
		this.#kernel.didAttach?.();
	}
}

/**
 * When present on a method, it indicates the methods return value should be replaced with `this` (the wrapper)
 * when wrapping the object with the method.
 * @remarks
 * This is useful when using {@link mergeAPIs} with methods where the return type is `this`, like `Map.set`.
 * @internal
 */
export const thisWrap: unique symbol = Symbol("selfWrap");

/**
 * A {@link SharedKernel} providing the implementation of some distributed data structure (DDS) and the needed runtime facing APIs,
 * and a separate view object which exposes the app facing APIs (`T`)
 * for reading and writing data which are specific to this particular data structure.
 * @remarks
 * Output from {@link SharedKernelFactory}.
 * This is an alternative to defining DDSs by sub-classing {@link SharedObject}.
 * @internal
 */
export interface FactoryOut<T extends object> {
	readonly kernel: SharedKernel;
	readonly view: T;
}

/**
 * A factory for creating DDSs.
 * @remarks
 * Outputs {@link FactoryOut}.
 * This is an alternative to directly implementing {@link @fluidframework/datastore-definitions#IChannelFactory}.
 * Use with {@link makeSharedObjectKind} to create a {@link SharedObjectKind}.
 * @internal
 */
export interface SharedKernelFactory<
	T extends object,
	TConfig extends ChannelConfiguration = ChannelConfiguration,
> {
	/**
	 * Reader support, independent of whether new instances opt into configuration.
	 * Marker-absent instances still load through the legacy protocol.
	 */
	readonly configurationDefinition?: ChannelConfigurationDefinition<TConfig>;

	create(args: KernelArgs<TConfig>): FactoryOut<T>;

	/**
	 * Create combined with {@link SharedObjectCore.loadCore}.
	 */
	loadCore(args: KernelArgs<TConfig>, storage: IChannelStorageService): Promise<FactoryOut<T>>;
}

/**
 * Inputs for building a {@link SharedKernel} via {@link SharedKernelFactory}.
 * @internal
 */
export interface KernelArgs<TConfig extends ChannelConfiguration = ChannelConfiguration> {
	/**
	 * Per-instance configuration, available before the kernel is constructed or loaded.
	 * Undefined for legacy instances, even when the factory supports configured readers.
	 */
	readonly configuration?: ChannelConfigurationFacet<TConfig>;
	/**
	 * The shared object whose behavior is being implemented.
	 */
	readonly sharedObject: IChannelView & IFluidLoadable;
	/**
	 * {@inheritdoc SharedObject.serializer}
	 */
	readonly serializer: IFluidSerializer;
	/**
	 * {@inheritdoc SharedObjectCore.submitLocalMessage}
	 */
	readonly submitLocalMessage: (op: unknown, localOpMetadata: unknown) => void;
	/**
	 * Top level emitter for events for this object.
	 * @remarks
	 * This is needed since the separate kernel and view from {@link FactoryOut} currently have to be recombined,
	 * and having this as its own thing helps accomplish that.
	 */
	readonly eventEmitter: TypedEventEmitter<ISharedObjectEvents>;
	/**
	 * {@inheritdoc SharedObjectCore.logger}
	 */
	readonly logger: TelemetryLoggerExt;
	/**
	 * {@inheritdoc @fluidframework/datastore-definitions#IFluidDataStoreRuntime.idCompressor}
	 */
	readonly idCompressor: IIdCompressor | undefined;
	/**
	 * {@inheritdoc @fluidframework/container-definitions#IDeltaManager.lastSequenceNumber}
	 */
	readonly lastSequenceNumber: () => number;
	/**
	 * {@inheritdoc @fluidframework/container-definitions#IDeltaManager.initialSequenceNumber}
	 */
	readonly initialSequenceNumber: number;
	/**
	 * Oldest Fluid Framework client version that must be able to process documents containing ops
	 * generated by the SharedObject implementation. Used to select compatible feature flags and
	 * formats, so choosing an older version may limit available features and write formats.
	 * See {@link @fluidframework/container-runtime#LoadContainerRuntimeParams.oldestSupportedClient}
	 * for more details.
	 */
	readonly minVersionForCollab: OldestSupportedClientVersion;
}

/**
 * Add getters to `base` which forward own properties from `extra`.
 * @remarks
 * This only handles use of "get" and "has".
 * Therefore, APIs involving setting properties should not be used as `Extra`.
 *
 * Functions from `extra` are bound to the `extra` object and support {@link thisWrap}.
 *
 * Asserts when properties collide.
 * @internal
 */
export function mergeAPIs<const Base extends object, const Extra extends object>(
	base: Base,
	extra: Extra,
): asserts base is Base & Extra {
	for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(extra))) {
		assert(!Reflect.has(base, key), 0xb9a /* colliding properties */);

		// Detect and special case functions.
		// Currently this is done eagerly (when mergeAPIs is called) rather than lazily (when the property is read):
		// this eager approach should result in slightly better performance,
		// but if functions on `extra` are reassigned over time it will produce incorrect behavior.
		// If this functionality is required, the design can be changed.
		let getter: () => unknown;
		// Bind functions to the extra object and handle thisWrap.
		if (typeof descriptor.value === "function") {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const fromExtra: () => Extra | Base = descriptor.value;
			getter = () => forwardMethod(fromExtra, extra, base);
			// To catch (and error on) cases where the function is reassigned and this eager binding approach is not appropriate, make it non-writable.
			Object.defineProperty(extra, key, { ...descriptor, writable: false });
		} else {
			getter = () => extra[key];
		}

		Object.defineProperty(base, key, {
			configurable: false,
			enumerable: descriptor.enumerable,
			get: getter,
			// If setters become required, support them here.
		});
	}
}

/**
 * Wrap a method `f` of `oldThis` to be a method of `newThis`.
 * @remarks
 * The wrapped function will be called with `oldThis` as the `this` parameter.
 * It also accounts for when `f` is marked with {@link thisWrap}.
 */
function forwardMethod<TArgs extends [], TReturn>(
	f: (...args: TArgs) => TReturn,
	oldThis: TReturn,
	newThis: TReturn,
): (...args: TArgs) => TReturn {
	// eslint-disable-next-line unicorn/prefer-ternary
	if (thisWrap in f) {
		return (...args: TArgs) => {
			const result = f.call(oldThis, ...args);
			assert(result === oldThis, 0xb9b /* methods returning thisWrap should return this */);
			return newThis;
		};
	} else {
		return f.bind(oldThis);
	}
}

/**
 * Options for creating a {@link SharedObjectKind} via {@link makeSharedObjectKind}.
 * @typeParam T - The type of the object exposed to the app.
 * This can optionally include members from {@link ISharedObject} which will be provided automatically.
 * @internal
 */
export interface SharedObjectOptions<
	T extends object,
	TConfig extends ChannelConfiguration = ChannelConfiguration,
> {
	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	readonly type: string;

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	readonly attributes: IChannelAttributes;

	/**
	 * The factory used to create the kernel and its view.
	 * @remarks
	 * The view produced by this factory will be grafted onto the {@link SharedObject} using {@link mergeAPIs}.
	 * See {@link mergeAPIs} for more information on limitations that apply.
	 */
	readonly factory: SharedKernelFactory<Omit<T, keyof ISharedObject>, TConfig>;

	/**
	 * Opts new instances into configuration. Load always uses persisted attributes instead.
	 * Each instance receives an immutable copy; factory attributes remain unchanged.
	 */
	readonly initialConfiguration?: TConfig;

	/**
	 * {@inheritDoc SharedObject.telemetryContextPrefix}
	 */
	readonly telemetryContextPrefix: string;
}

/**
 * Utility to create a {@link @fluidframework/datastore-definitions#IChannelFactory} classes.
 * @remarks
 * Use {@link makeSharedObjectKind} instead unless exposing the factory is required for legacy API compatibility.
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeChannelFactory<T extends object, TConfig extends ChannelConfiguration>(
	options: SharedObjectOptions<T, TConfig>,
) {
	class ChannelFactory implements IChannelFactory<T> {
		public get channelConfigurationProtocolVersion(): 1 | undefined {
			return options.factory.configurationDefinition === undefined ? undefined : 1;
		}

		/**
		 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
		 */
		public static readonly Type = options.type;

		/**
		 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
		 */
		public static readonly Attributes: IChannelAttributes = options.attributes;

		/**
		 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
		 */
		public get type(): string {
			return ChannelFactory.Type;
		}

		/**
		 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
		 */
		public get attributes(): IChannelAttributes {
			return ChannelFactory.Attributes;
		}

		/**
		 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
		 */
		public async load(
			runtime: IFluidDataStoreRuntime,
			id: string,
			services: IChannelServices,
			attributes: IChannelAttributes,
		): Promise<T & IChannel> {
			const shared = new SharedObjectFromKernel(
				id,
				runtime,
				attributes,
				options.factory,
				options.telemetryContextPrefix,
				"configuration" in attributes ? { snapshot: attributes.configuration } : undefined,
			);
			await shared.load(services);
			return shared as unknown as T & IChannel;
		}

		/**
		 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
		 */
		public create(runtime: IFluidDataStoreRuntime, id: string): T & IChannel {
			if (
				options.initialConfiguration !== undefined &&
				(runtime as ChannelConfigurationRuntime).isChannelConfigurationCreationEnabled?.(
					ChannelFactory.Attributes.type,
				) !== true
			) {
				throw new UsageError("Channel configuration creation is not enabled for this type");
			}
			const shared = new SharedObjectFromKernel(
				id,
				runtime,
				ChannelFactory.Attributes,
				options.factory,
				options.telemetryContextPrefix,
				options.initialConfiguration === undefined
					? undefined
					: { initialConfiguration: options.initialConfiguration },
			);

			shared.initializeLocal();

			return shared as unknown as T & IChannel;
		}
	}

	return ChannelFactory;
}

/**
 * Utility to create a {@link SharedObjectKind}.
 * @privateRemarks
 * Using this API avoids having to subclasses any Fluid Framework types,
 * reducing the coupling between the framework and the SharedObject implementation.
 * @internal
 */
export function makeSharedObjectKind<
	T extends object,
	TConfig extends ChannelConfiguration = ChannelConfiguration,
>(options: SharedObjectOptions<T, TConfig>): ISharedObjectKind<T> & SharedObjectKindAlpha<T> {
	return createSharedObjectKindAlpha<T>(makeChannelFactory(options));
}
