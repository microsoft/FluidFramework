/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import { assert, fail } from "@fluidframework/core-utils/internal";
import {
	IChannelStorageService,
	type IChannel,
	type IChannelAttributes,
	type IChannelFactory,
	type IChannelServices,
	type IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor/internal";
import {
	ISummaryTreeWithStats,
	ITelemetryContext,
	type IExperimentalIncrementalSummaryContext,
	type IRuntimeMessageCollection,
} from "@fluidframework/runtime-definitions/internal";
import type { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { IFluidSerializer } from "./serializer.js";
import {
	createSharedObjectKind,
	SharedObject,
	type ISharedObjectKind,
	type SharedObjectKind,
} from "./sharedObject.js";
import { ISharedObjectEvents, type ISharedObject } from "./types.js";
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
	processMessagesCore(messagesCollection: IRuntimeMessageCollection): void;

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
> extends SharedObject<TEvent> {
	/**
	 * Lazy init here so kernel can be constructed in loadCore when loading from existing data.
	 *
	 * Explicit initialization to undefined is done so Proxy knows this property is from this class (via `Reflect.has`),
	 * not from the grafted APIs.
	 */
	#lazyData: FactoryOut<TOut> | undefined = undefined;

	readonly #kernelArgs: KernelArgs;

	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		public readonly factory: SharedKernelFactory<TOut>,
		telemetryContextPrefix: string,
	) {
		super(id, runtime, attributes, telemetryContextPrefix);

		this.#kernelArgs = {
			sharedObject: this,
			serializer: this.serializer,
			submitLocalMessage: (op, localOpMetadata) =>
				this.submitLocalMessage(op, localOpMetadata),
			eventEmitter: this,
			logger: this.logger,
			idCompressor: runtime.idCompressor,
			lastSequenceNumber: () => this.deltaManager.lastSequenceNumber,
		};
	}

	protected override summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
	): ISummaryTreeWithStats {
		return this.#kernel.summarizeCore(serializer, telemetryContext, incrementalSummaryContext);
	}

	protected override initializeLocalCore(): void {
		this.#initializeData(this.factory.create(this.#kernelArgs));
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
		return (this.#lazyData ?? fail("must initializeData first")).kernel;
	}

	protected override async loadCore(storage: IChannelStorageService): Promise<void> {
		this.#initializeData(await this.factory.loadCore(this.#kernelArgs, storage));
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

	protected override processCore(): void {
		fail("processCore should not be called");
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
export interface SharedKernelFactory<T extends object> {
	create(args: KernelArgs): FactoryOut<T>;

	/**
	 * Create combined with {@link SharedObjectCore.loadCore}.
	 */
	loadCore(args: KernelArgs, storage: IChannelStorageService): Promise<FactoryOut<T>>;
}

/**
 * Inputs for building a {@link SharedKernel} via {@link SharedKernelFactory}.
 * @internal
 */
export interface KernelArgs {
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
	readonly logger: ITelemetryLoggerExt;
	/**
	 * {@inheritdoc @fluidframework/datastore-definitions#IFluidDataStoreRuntime.idCompressor}
	 */
	readonly idCompressor: IIdCompressor | undefined;
	/**
	 * {@inheritdoc @fluidframework/container-definitions#IDeltaManager.lastSequenceNumber}
	 */
	readonly lastSequenceNumber: () => number;
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
export interface SharedObjectOptions<T extends object> {
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
	readonly factory: SharedKernelFactory<Omit<T, keyof ISharedObject>>;

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
function makeChannelFactory<T extends object>(options: SharedObjectOptions<T>) {
	class ChannelFactory implements IChannelFactory<T> {
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
			);
			await shared.load(services);
			return shared as unknown as T & IChannel;
		}

		/**
		 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
		 */
		public create(runtime: IFluidDataStoreRuntime, id: string): T & IChannel {
			const shared = new SharedObjectFromKernel(
				id,
				runtime,
				ChannelFactory.Attributes,
				options.factory,
				options.telemetryContextPrefix,
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
export function makeSharedObjectKind<T extends object>(
	options: SharedObjectOptions<T>,
): ISharedObjectKind<T> & SharedObjectKind<T> {
	return createSharedObjectKind<T>(makeChannelFactory(options));
}
