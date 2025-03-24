/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IContainer,
	IFluidCodeDetails,
	IFluidModule,
	IHostLoader,
	ILoader,
	ILoaderOptions,
	IProvideFluidCodeDetailsComparer,
	LoaderHeader,
} from "@fluidframework/container-definitions/internal";
import {
	FluidObject,
	IConfigProviderBase,
	IRequest,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import { IClientDetails } from "@fluidframework/driver-definitions";
import {
	IDocumentServiceFactory,
	IDocumentStorageService,
	IResolvedUrl,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import {
	ITelemetryLoggerExt,
	MonitoringContext,
	PerformanceEvent,
	createChildMonitoringContext,
	mixinMonitoringContext,
	sessionStorageConfigProvider,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import { Container } from "./container.js";
import { DebugLogger } from "./debugLogger.js";
import { pkgVersion } from "./packageVersion.js";
import { ProtocolHandlerBuilder } from "./protocol.js";
import type { IPendingContainerState } from "./serializedStateManager.js";
import {
	getAttachedContainerStateFromSerializedContainer,
	tryParseCompatibleResolvedUrl,
} from "./utils.js";

function ensureResolvedUrlDefined(
	resolved: IResolvedUrl | undefined,
): asserts resolved is IResolvedUrl {
	if (resolved === undefined) {
		throw new Error(`Object is not a IResolveUrl.`);
	}
}
/**
 * @internal
 */
export class RelativeLoader implements ILoader {
	constructor(
		private readonly container: Container,
		private readonly loader: ILoader | undefined,
	) {}

	public async resolve(request: IRequest): Promise<IContainer> {
		if (request.url.startsWith("/")) {
			ensureResolvedUrlDefined(this.container.resolvedUrl);
			const container = await this.container.clone(
				{
					resolvedUrl: { ...this.container.resolvedUrl },
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					version: request.headers?.[LoaderHeader.version] ?? undefined,
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					loadMode: request.headers?.[LoaderHeader.loadMode],
				},
				{
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					canReconnect: request.headers?.[LoaderHeader.reconnect],
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					clientDetailsOverride: request.headers?.[LoaderHeader.clientDetails],
				},
			);
			return container;
		}

		if (this.loader === undefined) {
			throw new Error("Cannot resolve external containers");
		}
		return this.loader.resolve(request);
	}
}

/**
 * @deprecated IFluidModuleWithDetails interface is moved to
 * {@link @fluidframework/container-definitions#IFluidModuleWithDetails}
 * to have all the code loading modules in one package. #8193
 * Encapsulates a module entry point with corresponding code details.
 * @legacy
 * @alpha
 */
export interface IFluidModuleWithDetails {
	/**
	 * Fluid code module that implements the runtime factory needed to instantiate the container runtime.
	 */
	module: IFluidModule;
	/**
	 * Code details associated with the module. Represents a document schema this module supports.
	 * If the code loader implements the {@link @fluidframework/core-interfaces#IFluidCodeDetailsComparer} interface,
	 * it'll be called to determine whether the module code details satisfy the new code proposal in the quorum.
	 */
	details: IFluidCodeDetails;
}

/**
 * @deprecated ICodeDetailsLoader interface is moved to {@link @fluidframework/container-definitions#ICodeDetailsLoader}
 * to have code loading modules in one package. #8193
 * Fluid code loader resolves a code module matching the document schema, i.e. code details, such as
 * a package name and package version range.
 * @legacy
 * @alpha
 */
export interface ICodeDetailsLoader extends Partial<IProvideFluidCodeDetailsComparer> {
	/**
	 * Load the code module (package) that is capable to interact with the document.
	 *
	 * @param source - Code proposal that articulates the current schema the document is written in.
	 * @returns Code module entry point along with the code details associated with it.
	 */
	load(source: IFluidCodeDetails): Promise<IFluidModuleWithDetails>;
}

/**
 * Services and properties necessary for creating a loader
 * @legacy
 * @alpha
 */
export interface ILoaderProps {
	/**
	 * The url resolver used by the loader for resolving external urls
	 * into Fluid urls such that the container specified by the
	 * external url can be loaded.
	 */
	readonly urlResolver: IUrlResolver;
	/**
	 * The document service factory take the Fluid url provided
	 * by the resolved url and constructs all the necessary services
	 * for communication with the container's server.
	 */
	readonly documentServiceFactory: IDocumentServiceFactory;
	/**
	 * The code loader handles loading the necessary code
	 * for running a container once it is loaded.
	 */
	readonly codeLoader: ICodeDetailsLoader;

	/**
	 * A property bag of options used by various layers
	 * to control features
	 */
	readonly options?: ILoaderOptions;

	/**
	 * Scope is provided to all container and is a set of shared
	 * services for container's to integrate with their host environment.
	 */
	readonly scope?: FluidObject;

	/**
	 * The logger that all telemetry should be pushed to.
	 */
	readonly logger?: ITelemetryBaseLogger;

	/**
	 * Blobs storage for detached containers.
	 */
	readonly detachedBlobStorage?: IDetachedBlobStorage;

	/**
	 * The configuration provider which may be used to control features.
	 */
	readonly configProvider?: IConfigProviderBase;

	/**
	 * Optional property for allowing the container to use a custom
	 * protocol implementation for handling the quorum and/or the audience.
	 */
	readonly protocolHandlerBuilder?: ProtocolHandlerBuilder;
}

/**
 * Services and properties used by and exposed by the loader
 * @legacy
 * @alpha
 */
export interface ILoaderServices {
	/**
	 * The url resolver used by the loader for resolving external urls
	 * into Fluid urls such that the container specified by the
	 * external url can be loaded.
	 */
	readonly urlResolver: IUrlResolver;
	/**
	 * The document service factory take the Fluid url provided
	 * by the resolved url and constructs all the necessary services
	 * for communication with the container's server.
	 */
	readonly documentServiceFactory: IDocumentServiceFactory;
	/**
	 * The code loader handles loading the necessary code
	 * for running a container once it is loaded.
	 */
	readonly codeLoader: ICodeDetailsLoader;

	/**
	 * A property bag of options used by various layers
	 * to control features
	 */
	readonly options: ILoaderOptions;

	/**
	 * Scope is provided to all container and is a set of shared
	 * services for container's to integrate with their host environment.
	 */
	readonly scope: FluidObject;

	/**
	 * The logger downstream consumers should construct their loggers from
	 */
	readonly subLogger: ITelemetryLoggerExt;

	/**
	 * Blobs storage for detached containers.
	 * @deprecated - IDetachedBlobStorage will be removed in a future release without a replacement. Blobs created while detached will be stored in memory to align with attached container behavior. AB#8049
	 */
	readonly detachedBlobStorage?: IDetachedBlobStorage;

	/**
	 * Optional property for allowing the container to use a custom
	 * protocol implementation for handling the quorum and/or the audience.
	 */
	readonly protocolHandlerBuilder?: ProtocolHandlerBuilder;
}

/**
 * Subset of IDocumentStorageService which only supports createBlob() and readBlob(). This is used to support
 * blobs in detached containers.
 * @legacy
 * @alpha
 *
 * @deprecated - IDetachedBlobStorage will be removed in a future release without a replacement. Blobs created while detached will be stored in memory to align with attached container behavior. AB#8049
 */
export type IDetachedBlobStorage = Pick<IDocumentStorageService, "createBlob" | "readBlob"> & {
	size: number;
	/**
	 * Return an array of all blob IDs present in storage
	 */
	getBlobIds(): string[];

	/**
	 * After the container is attached, the detached blob storage is no longer needed and will be disposed.
	 */
	dispose?(): void;
};

/**
 * Manages Fluid resource loading
 * @legacy
 * @alpha
 */
export class Loader implements IHostLoader {
	public readonly services: ILoaderServices;
	private readonly mc: MonitoringContext;

	constructor(loaderProps: ILoaderProps) {
		const {
			urlResolver,
			documentServiceFactory,
			codeLoader,
			options,
			scope,
			logger,
			detachedBlobStorage,
			configProvider,
			protocolHandlerBuilder,
		} = loaderProps;

		const telemetryProps = {
			loaderId: uuid(),
			loaderVersion: pkgVersion,
		};

		const subMc = mixinMonitoringContext(
			DebugLogger.mixinDebugLogger("fluid:telemetry", logger, {
				all: telemetryProps,
			}),
			sessionStorageConfigProvider.value,
			configProvider,
		);

		this.services = {
			urlResolver,
			documentServiceFactory,
			codeLoader,
			options: options ?? {},
			scope:
				options?.provideScopeLoader === false ? { ...scope } : { ...scope, ILoader: this },
			detachedBlobStorage,
			protocolHandlerBuilder,
			subLogger: subMc.logger,
		};
		this.mc = createChildMonitoringContext({
			logger: this.services.subLogger,
			namespace: "Loader",
		});
	}

	public async createDetachedContainer(
		codeDetails: IFluidCodeDetails,
		createDetachedProps?: {
			canReconnect?: boolean;
			clientDetailsOverride?: IClientDetails;
		},
	): Promise<IContainer> {
		return Container.createDetached(
			{
				...createDetachedProps,
				...this.services,
			},
			codeDetails,
		);
	}

	public async rehydrateDetachedContainerFromSnapshot(
		snapshot: string,
		createDetachedProps?: {
			canReconnect?: boolean;
			clientDetailsOverride?: IClientDetails;
		},
	): Promise<IContainer> {
		return Container.rehydrateDetachedFromSnapshot(
			{
				...createDetachedProps,
				...this.services,
			},
			snapshot,
		);
	}

	public async resolve(request: IRequest, pendingLocalState?: string): Promise<IContainer> {
		const eventName = pendingLocalState === undefined ? "Resolve" : "ResolveWithPendingState";
		return PerformanceEvent.timedExecAsync(this.mc.logger, { eventName }, async () => {
			return this.resolveCore(
				request,
				getAttachedContainerStateFromSerializedContainer(pendingLocalState),
			);
		});
	}

	private async resolveCore(
		request: IRequest,
		pendingLocalState?: IPendingContainerState,
	): Promise<Container> {
		const resolvedAsFluid = await this.services.urlResolver.resolve(request);
		ensureResolvedUrlDefined(resolvedAsFluid);

		// Parse URL into data stores
		const parsed = tryParseCompatibleResolvedUrl(resolvedAsFluid.url);
		if (parsed === undefined) {
			throw new Error(`Invalid URL ${resolvedAsFluid.url}`);
		}

		if (pendingLocalState !== undefined) {
			const parsedPendingUrl = tryParseCompatibleResolvedUrl(pendingLocalState.url);
			if (
				parsedPendingUrl?.id !== parsed.id ||
				parsedPendingUrl?.path.replace(/\/$/, "") !== parsed.path.replace(/\/$/, "")
			) {
				const message = `URL ${resolvedAsFluid.url} does not match pending state URL ${pendingLocalState.url}`;
				throw new Error(message);
			}
		}

		request.headers ??= {};
		// If set in both query string and headers, use query string.  Also write the value from the query string into the header either way.
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		request.headers[LoaderHeader.version] =
			parsed.version ?? request.headers[LoaderHeader.version];

		return this.loadContainer(request, resolvedAsFluid, pendingLocalState);
	}

	private async loadContainer(
		request: IRequest,
		resolvedUrl: IResolvedUrl,
		pendingLocalState?: IPendingContainerState,
	): Promise<Container> {
		return Container.load(
			{
				resolvedUrl,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				version: request.headers?.[LoaderHeader.version] ?? undefined,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				loadMode: request.headers?.[LoaderHeader.loadMode],
				pendingLocalState,
			},
			{
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				canReconnect: request.headers?.[LoaderHeader.reconnect],
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				clientDetailsOverride: request.headers?.[LoaderHeader.clientDetails],
				...this.services,
			},
		);
	}
}
