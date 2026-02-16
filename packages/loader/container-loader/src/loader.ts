/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IContainer,
	type IFluidCodeDetails,
	type IFluidModule,
	type IHostLoader,
	type ILoader,
	type ILoaderOptions,
	type IProvideFluidCodeDetailsComparer,
	LoaderHeader,
} from "@fluidframework/container-definitions/internal";
import type {
	FluidObject,
	IConfigProviderBase,
	IRequest,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import type { IClientDetails } from "@fluidframework/driver-definitions";
import type {
	IDocumentServiceFactory,
	IResolvedUrl,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import {
	type ITelemetryLoggerExt,
	type MonitoringContext,
	PerformanceEvent,
	createChildMonitoringContext,
	mixinMonitoringContext,
	sessionStorageConfigProvider,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import { Container } from "./container.js";
import { DebugLogger } from "./debugLogger.js";
import { pkgVersion } from "./packageVersion.js";
import type { ProtocolHandlerBuilder } from "./protocol.js";
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
 * @legacy @beta
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
 * @legacy @beta
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
 * @legacy @beta
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
 * @legacy @beta
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
	 * Optional property for allowing the container to use a custom
	 * protocol implementation for handling the quorum and/or the audience.
	 */
	readonly protocolHandlerBuilder?: ProtocolHandlerBuilder;
}

/**
 * Creates the loader services and monitoring context from loader properties.
 * This is the core setup logic extracted from the Loader constructor.
 * @param loaderProps - Properties for creating the loader services
 * @param scopeLoader - Optional ILoader to inject into the scope for containers
 * @internal
 */
export function createLoaderServices(
	loaderProps: ILoaderProps,
	scopeLoader?: ILoader,
): {
	services: ILoaderServices;
	mc: MonitoringContext;
} {
	const {
		urlResolver,
		documentServiceFactory,
		codeLoader,
		options,
		scope,
		logger,
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

	const services: ILoaderServices = {
		urlResolver,
		documentServiceFactory,
		codeLoader,
		options: options ?? {},
		scope:
			options?.provideScopeLoader === false || scopeLoader === undefined
				? { ...scope }
				: { ...scope, ILoader: scopeLoader },
		protocolHandlerBuilder,
		subLogger: subMc.logger,
	};
	const mc = createChildMonitoringContext({
		logger: services.subLogger,
		namespace: "Loader",
	});

	return { services, mc };
}

/**
 * Resolves a request and loads a container using the provided services and monitoring context.
 * This is the resolve logic extracted from the Loader class.
 * @internal
 */
export async function resolveAndLoadContainer(
	services: ILoaderServices,
	mc: MonitoringContext,
	request: IRequest,
	pendingLocalState?: string,
): Promise<IContainer> {
	const eventName = pendingLocalState === undefined ? "Resolve" : "ResolveWithPendingState";
	return PerformanceEvent.timedExecAsync(mc.logger, { eventName }, async () => {
		const parsedPendingState =
			getAttachedContainerStateFromSerializedContainer(pendingLocalState);

		const resolvedAsFluid = await services.urlResolver.resolve(request);
		ensureResolvedUrlDefined(resolvedAsFluid);

		// Parse URL into data stores
		const parsed = tryParseCompatibleResolvedUrl(resolvedAsFluid.url);
		if (parsed === undefined) {
			throw new Error(`Invalid URL ${resolvedAsFluid.url}`);
		}

		if (parsedPendingState !== undefined) {
			const parsedPendingUrl = tryParseCompatibleResolvedUrl(parsedPendingState.url);
			if (
				parsedPendingUrl?.id !== parsed.id ||
				parsedPendingUrl?.path.replace(/\/$/, "") !== parsed.path.replace(/\/$/, "")
			) {
				const message = `URL ${resolvedAsFluid.url} does not match pending state URL ${parsedPendingState.url}`;
				throw new Error(message);
			}
		}

		request.headers ??= {};
		// If set in both query string and headers, use query string.  Also write the value from the query string into the header either way.
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		request.headers[LoaderHeader.version] =
			parsed.version ?? request.headers[LoaderHeader.version];

		return Container.load(
			{
				resolvedUrl: resolvedAsFluid,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				version: request.headers?.[LoaderHeader.version] ?? undefined,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				loadMode: request.headers?.[LoaderHeader.loadMode],
				pendingLocalState: parsedPendingState,
			},
			{
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				canReconnect: request.headers?.[LoaderHeader.reconnect],
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				clientDetailsOverride: request.headers?.[LoaderHeader.clientDetails],
				...services,
			},
		);
	});
}

/**
 * Creates an IHostLoader instance from loader properties.
 * This is the recommended replacement for the deprecated Loader class.
 * @param loaderProps - Services and properties necessary for creating a loader
 * @returns An IHostLoader that can create, rehydrate, and load containers
 * @legacy @beta
 */
export function createLoader(loaderProps: ILoaderProps): IHostLoader {
	// Declare services/mc as mutable so they can be assigned after creating the loader object.
	// The closures below capture these by reference, so they'll see the assigned values
	// when actually invoked (which is always after this function returns).
	let services: ILoaderServices;
	let mc: MonitoringContext;

	// Create the loader object first so it can be passed to createLoaderServices
	// for injection into scope (when provideScopeLoader is enabled).
	const loader: IHostLoader = {
		createDetachedContainer: async (
			codeDetails: IFluidCodeDetails,
			createDetachedProps?: {
				canReconnect?: boolean;
				clientDetailsOverride?: IClientDetails;
			},
		): Promise<IContainer> => {
			return Container.createDetached(
				{
					...createDetachedProps,
					...services,
				},
				codeDetails,
			);
		},
		rehydrateDetachedContainerFromSnapshot: async (
			snapshot: string,
			createDetachedProps?: {
				canReconnect?: boolean;
				clientDetailsOverride?: IClientDetails;
			},
		): Promise<IContainer> => {
			return Container.rehydrateDetachedFromSnapshot(
				{
					...createDetachedProps,
					...services,
				},
				snapshot,
			);
		},
		resolve: async (request: IRequest, pendingLocalState?: string): Promise<IContainer> => {
			return resolveAndLoadContainer(services, mc, request, pendingLocalState);
		},
	};

	({ services, mc } = createLoaderServices(loaderProps, loader));

	return loader;
}
