/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	IChannelStorageService,
	type IChannel,
	type IChannelAttributes,
	type IChannelFactory,
	type IChannelServices,
	type IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor/internal";
import {
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";
import type { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { SharedObjectHandle } from "./handle.js";
import { IFluidSerializer } from "./serializer.js";
import {
	createSharedObjectKind,
	SharedObject,
	type ISharedObjectKind,
	type SharedObjectKind,
} from "./sharedObject.js";
import { ISharedObjectEvents, type ISharedObject } from "./types.js";

/**
 * Functionality specific a particular kind of shared object.
 * @remarks
 * SharedObject's expose APIs for two consumers:
 *
 * 1. The runtime, which uses the SharedObject summarize, load and apply ops.
 * 2. The user, who uses the SharedObject to read and write data.
 *
 * There is some common functionality all shared objects use, provided by {@link SharedObject}.
 * SharedKernel describes the portion of the behavior required by the runtime which
 * differs between different kinds of shared objects.
 *
 * {@link SharedObjectFromKernel} is then used to wrap up the kernel into a full {@link SharedObject}.
 * The runtime specific APIs are then type erased into a {@link SharedObjectKind}.
 * @internal
 */
export interface SharedKernel {
	/**
	 * {@inheritDoc SharedObject.summarizeCore}
	 */
	summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats;

	// TODO: maybe this should be part of the factory, not a method here?
	// That would enable lazy loading the kernel code during this call.
	/**
	 * {@inheritDoc SharedObjectCore.loadCore}
	 */
	loadCore(storage: IChannelStorageService): Promise<void>;

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
	 * {@inheritDoc SharedObjectCore.processCore}
	 */
	processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void;

	/**
	 * {@inheritDoc SharedObjectCore.rollback}
	 */
	rollback?(content: unknown, localOpMetadata: unknown): void;
}

/**
 * SharedObject implementation that delegates to a SharedKernel.
 * @internal
 */
export abstract class SharedObjectFromKernel<
	TEvent extends ISharedObjectEvents,
> extends SharedObject<TEvent> {
	protected abstract get kernel(): SharedKernel;

	protected override summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		return this.kernel.summarizeCore(serializer, telemetryContext);
	}

	protected override async loadCore(storage: IChannelStorageService): Promise<void> {
		return this.kernel.loadCore(storage);
	}

	protected override onDisconnect(): void {
		this.kernel.onDisconnect();
	}

	protected override reSubmitCore(content: unknown, localOpMetadata: unknown): void {
		this.kernel.reSubmitCore(content, localOpMetadata);
	}

	protected override applyStashedOp(content: unknown): void {
		this.kernel.applyStashedOp(content);
	}

	protected override processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		this.kernel.processCore(message, local, localOpMetadata);
	}

	protected override rollback(content: unknown, localOpMetadata: unknown): void {
		if (this.kernel.rollback === undefined) {
			super.rollback(content, localOpMetadata);
		} else {
			this.kernel.rollback(content, localOpMetadata);
		}
	}
}

/**
 * When present on a method, it indicates the methods return value should be replaced with `this` (the wrapper)
 * when wrapping the object with the method.
 * @internal
 */
export const thisWrap: unique symbol = Symbol("selfWrap");

/**
 * @internal
 */
export interface FactoryOut<T extends object> {
	readonly kernel: SharedKernel;
	readonly view: T;
}

/**
 * TODO: Maybe move loadCore here.
 * @internal
 */
export interface SharedKernelFactory<T extends object> {
	create(args: KernelArgs): FactoryOut<T>;
}

/**
 * @internal
 */
export interface KernelArgs {
	readonly id: string;
	readonly serializer: IFluidSerializer;
	readonly handle: IFluidHandle;
	readonly submitLocalMessage: (op: unknown, localOpMetadata: unknown) => void;
	readonly isAttached: () => boolean;
	readonly eventEmitter: TypedEventEmitter<ISharedObjectEvents>;
	readonly logger: ITelemetryLoggerExt;
	readonly idCompressor: IIdCompressor | undefined;
	readonly lastSequenceNumber: () => number;
}

/**
 * Map which can be based on a SharedMap or a SharedTree.
 *
 * Once this has been accessed as a SharedTree, the SharedMap APIs are no longer accessible.
 *
 * TODO: events
 */
class SharedObjectFromKernelFull<
	TOut extends object,
	TEvents extends ISharedObjectEvents,
> extends SharedObjectFromKernel<TEvents> {
	// Lazy init here so correct kernel constructed in loadCore when loading from existing data.
	#data: FactoryOut<TOut> | undefined;

	private readonly kernelArgs: KernelArgs;

	/**
	 * @param id - String identifier.
	 * @param runtime - Data store runtime.
	 * @param attributes - The attributes for the map.
	 */
	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		public readonly factory: SharedKernelFactory<TOut>,
		telemetryContextPrefix: string,
	) {
		super(id, runtime, attributes, telemetryContextPrefix);

		// Proxy which grafts the adapter's APIs onto this object.
		const merged = mergeAPIs(this, () => this.data.view);

		this.handle = new SharedObjectHandle(merged, id, runtime.IFluidHandleContext);

		this.kernelArgs = {
			id,
			serializer: this.serializer,
			handle: this.handle,
			submitLocalMessage: (op, localOpMetadata) =>
				this.submitLocalMessage(op, localOpMetadata),
			isAttached: () => this.isAttached(),
			eventEmitter: merged,
			logger: this.logger,
			idCompressor: runtime.idCompressor,
			lastSequenceNumber: () => this.deltaManager.lastSequenceNumber,
		};

		return merged;
	}

	private get data(): FactoryOut<TOut> {
		this.#data ??= this.factory.create(this.kernelArgs);
		return this.#data;
	}

	protected override get kernel(): SharedKernel {
		return this.data.kernel;
	}
}

/**
 * User a proxy to add APIs from extra onto base.
 * @internal
 */
export function mergeAPIs<Base extends object, Extra extends object>(
	base: Base,
	extraGetter: () => Extra,
): Base & Extra {
	// Proxy which grafts the adapter's APIs onto this object.
	return new Proxy(base, {
		get: (target, prop, receiver) => {
			// Prefer `this` over adapter when there is a conflict.
			if (Reflect.has(target, prop)) {
				return Reflect.get(target, prop, target);
			}
			const extra = extraGetter();
			const adapted = Reflect.get(extra, prop, extra) as unknown;
			if (adapted instanceof Function) {
				// eslint-disable-next-line unicorn/prefer-ternary
				if (thisWrap in adapted) {
					return (...args: unknown[]) => {
						// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/ban-types
						const result = (adapted as unknown as Function).call(extra, ...args);
						assert(result === extra, "methods returning thisWrap should return this");
						// eslint-disable-next-line @typescript-eslint/no-unsafe-return
						return receiver;
					};
				} else {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-return
					return adapted.bind(extra);
				}
			}

			return adapted;
		},
	}) as Base & Extra;
}

/**
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

	readonly factory: SharedKernelFactory<Omit<T, keyof ISharedObject>>;

	readonly telemetryContextPrefix: string;
}

/**
 * Utility to create a IChannelFactory classes.
 * @remarks
 * Prefer using {@link makeSharedObjectKind} instead if exposing the factory is not needed for legacy API compatibility.
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/explicit-function-return-type
export function makeChannelFactory<T extends object>(options: SharedObjectOptions<T>) {
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
			const shared = new SharedObjectFromKernelFull(
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
			const shared = new SharedObjectFromKernelFull(
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
 * Utility to create a SharedObjectKind.
 * @privateRemarks
 * Using this API avoids having to subclasses any Fluid Framework types,
 * reducing the coupling between the framework and the shared object implementation.
 * @internal
 */
export function makeSharedObjectKind<T extends object>(
	options: SharedObjectOptions<T>,
): ISharedObjectKind<T> & SharedObjectKind<T> {
	return createSharedObjectKind<T>(makeChannelFactory(options));
}
