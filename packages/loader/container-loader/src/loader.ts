/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import {
	ITelemetryLoggerExt,
	IConfigProviderBase,
	mixinMonitoringContext,
	MonitoringContext,
	PerformanceEvent,
	sessionStorageConfigProvider,
	createChildMonitoringContext,
} from "@fluidframework/telemetry-utils";
import {
	ITelemetryBaseLogger,
	FluidObject,
	IFluidRouter,
	IRequest,
	IRequestHeader,
	IResponse,
} from "@fluidframework/core-interfaces";
import {
	IContainer,
	IFluidModule,
	IHostLoader,
	ILoader,
	ILoaderOptions as ILoaderOptions1,
	LoaderHeader,
	IProvideFluidCodeDetailsComparer,
	IFluidCodeDetails,
} from "@fluidframework/container-definitions";
import {
	IDocumentServiceFactory,
	IDocumentStorageService,
	IResolvedUrl,
	IUrlResolver,
} from "@fluidframework/driver-definitions";
import { UsageError } from "@fluidframework/container-utils";
import { IClientDetails } from "@fluidframework/protocol-definitions";
import { Container, IPendingContainerState } from "./container";
import { IParsedUrl, parseUrl } from "./utils";
import { pkgVersion } from "./packageVersion";
import { ProtocolHandlerBuilder } from "./protocol";
import { DebugLogger } from "./debugLogger";

function canUseCache(request: IRequest): boolean {
	return request.headers?.[LoaderHeader.cache] === true;
}

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

	/**
	 * @deprecated - Will be removed in future major release. Migrate all usage of IFluidRouter to the Container's IFluidRouter/request.
	 */
	public get IFluidRouter(): IFluidRouter {
		return this;
	}

	public async resolve(request: IRequest): Promise<IContainer> {
		if (request.url.startsWith("/")) {
			if (canUseCache(request)) {
				return this.container;
			} else {
				ensureResolvedUrlDefined(this.container.resolvedUrl);
				const container = await this.container.clone(
					{
						resolvedUrl: { ...this.container.resolvedUrl },
						version: request.headers?.[LoaderHeader.version] ?? undefined,
						loadMode: request.headers?.[LoaderHeader.loadMode],
					},
					{
						canReconnect: request.headers?.[LoaderHeader.reconnect],
						clientDetailsOverride: request.headers?.[LoaderHeader.clientDetails],
					},
				);
				return container;
			}
		}

		if (this.loader === undefined) {
			throw new Error("Cannot resolve external containers");
		}
		return this.loader.resolve(request);
	}

	/**
	 * @deprecated - Will be removed in future major release. Migrate all usage of IFluidRouter to the Container's IFluidRouter/request.
	 */
	public async request(request: IRequest): Promise<IResponse> {
		if (request.url.startsWith("/")) {
			const container = await this.resolve(request);
			return container.request(request);
		}

		if (this.loader === undefined) {
			return {
				status: 404,
				value: "Cannot request external containers",
				mimeType: "plain/text",
			};
		}
		return this.loader.request(request);
	}
}

export interface ILoaderOptions extends ILoaderOptions1 {
	summarizeProtocolTree?: boolean;
}

/**
 * @deprecated IFluidModuleWithDetails interface is moved to
 * {@link @fluidframework/container-definitions#IFluidModuleWithDetails}
 * to have all the code loading modules in one package. #8193
 * Encapsulates a module entry point with corresponding code details.
 */
export interface IFluidModuleWithDetails {
	/** Fluid code module that implements the runtime factory needed to instantiate the container runtime. */
	module: IFluidModule;
	/**
	 * Code details associated with the module. Represents a document schema this module supports.
	 * If the code loader implements the {@link @fluidframework/core-interfaces#IFluidCodeDetailsComparer} interface,
	 * it'll be called to determine whether the module code details satisfy the new code proposal in the quorum.
	 */
	details: IFluidCodeDetails;
}

/**
 * @deprecated ICodeDetailsLoader interface is moved to {@link @fluidframework/container-definition#ICodeDetailsLoader}
 * to have code loading modules in one package. #8193
 * Fluid code loader resolves a code module matching the document schema, i.e. code details, such as
 * a package name and package version range.
 */
export interface ICodeDetailsLoader extends Partial<IProvideFluidCodeDetailsComparer> {
	/**
	 * Load the code module (package) that is capable to interact with the document.
	 *
	 * @param source - Code proposal that articulates the current schema the document is written in.
	 * @returns - Code module entry point along with the code details associated with it.
	 */
	load(source: IFluidCodeDetails): Promise<IFluidModuleWithDetails>;
}

/**
 * Services and properties necessary for creating a loader
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
 */
export type IDetachedBlobStorage = Pick<IDocumentStorageService, "createBlob" | "readBlob"> & {
	size: number;
	/**
	 * Return an array of all blob IDs present in storage
	 */
	getBlobIds(): string[];
};

/**
 * With an already-resolved container, we can request a component directly, without loading the container again
 * @param container - a resolved container
 * @returns component on the container
 */
export async function requestResolvedObjectFromContainer(
	container: IContainer,
	headers?: IRequestHeader,
): Promise<IResponse> {
	ensureResolvedUrlDefined(container.resolvedUrl);
	const parsedUrl = parseUrl(container.resolvedUrl.url);

	if (parsedUrl === undefined) {
		throw new Error(`Invalid URL ${container.resolvedUrl.url}`);
	}

	const entryPoint: FluidObject<IFluidRouter> | undefined = await container.getEntryPoint?.();
	const router = entryPoint?.IFluidRouter ?? container.IFluidRouter;

	return router.request({
		url: `${parsedUrl.path}${parsedUrl.query}`,
		headers,
	});
}

/**
 * Manages Fluid resource loading
 */
export class Loader implements IHostLoader {
	private readonly containers = new Map<string, Promise<Container>>();
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
				options?.provideScopeLoader !== false ? { ...scope, ILoader: this } : { ...scope },
			detachedBlobStorage,
			protocolHandlerBuilder,
			subLogger: subMc.logger,
		};
		this.mc = createChildMonitoringContext({
			logger: this.services.subLogger,
			namespace: "Loader",
		});
	}

	/**
	 * @deprecated - Will be removed in future major release. Migrate all usage of IFluidRouter to the Container's IFluidRouter/request.
	 */
	public get IFluidRouter(): IFluidRouter {
		return this;
	}

	public async createDetachedContainer(
		codeDetails: IFluidCodeDetails,
		createDetachedProps?: {
			canReconnect?: boolean;
			clientDetailsOverride?: IClientDetails;
		},
	): Promise<IContainer> {
		const container = await Container.createDetached(
			{
				...createDetachedProps,
				...this.services,
			},
			codeDetails,
		);

		if (this.cachingEnabled) {
			container.once("attached", () => {
				ensureResolvedUrlDefined(container.resolvedUrl);
				const parsedUrl = parseUrl(container.resolvedUrl.url);
				if (parsedUrl !== undefined) {
					this.addToContainerCache(parsedUrl.id, Promise.resolve(container));
				}
			});
		}

		return container;
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
			const resolved = await this.resolveCore(
				request,
				pendingLocalState !== undefined ? JSON.parse(pendingLocalState) : undefined,
			);
			return resolved.container;
		});
	}

	/**
	 * @deprecated - Will be removed in future major release. Migrate all usage of IFluidRouter to the Container's IFluidRouter/request.
	 */
	public async request(request: IRequest): Promise<IResponse> {
		return PerformanceEvent.timedExecAsync(
			this.mc.logger,
			{ eventName: "Request" },
			async () => {
				const resolved = await this.resolveCore(request);
				return resolved.container.request({
					...request,
					url: `${resolved.parsed.path}${resolved.parsed.query}`,
				});
			},
		);
	}

	private getKeyForContainerCache(request: IRequest, parsedUrl: IParsedUrl): string {
		const key =
			request.headers?.[LoaderHeader.version] !== undefined
				? `${parsedUrl.id}@${request.headers[LoaderHeader.version]}`
				: parsedUrl.id;
		return key;
	}

	private addToContainerCache(key: string, containerP: Promise<Container>) {
		this.containers.set(key, containerP);
		containerP
			.then((container) => {
				// If the container is closed/disposed or becomes closed/disposed after we resolve it,
				// remove it from the cache.
				if (container.closed || container.disposed) {
					this.containers.delete(key);
				} else {
					container.once("closed", () => {
						this.containers.delete(key);
					});
					container.once("disposed", () => {
						this.containers.delete(key);
					});
				}
			})
			.catch((error) => {
				// If an error occured while resolving the container request, then remove it from the cache.
				this.containers.delete(key);
			});
	}

	private async resolveCore(
		request: IRequest,
		pendingLocalState?: IPendingContainerState,
	): Promise<{ container: Container; parsed: IParsedUrl }> {
		const resolvedAsFluid = await this.services.urlResolver.resolve(request);
		ensureResolvedUrlDefined(resolvedAsFluid);

		// Parse URL into data stores
		const parsed = parseUrl(resolvedAsFluid.url);
		if (parsed === undefined) {
			throw new Error(`Invalid URL ${resolvedAsFluid.url}`);
		}

		if (pendingLocalState !== undefined) {
			const parsedPendingUrl = parseUrl(pendingLocalState.url);
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
		request.headers[LoaderHeader.version] =
			parsed.version ?? request.headers[LoaderHeader.version];
		const cacheHeader = request.headers[LoaderHeader.cache];
		const canCache =
			// Take header value if present, else use ILoaderOptions.cache value
			(cacheHeader !== undefined ? cacheHeader === true : this.cachingEnabled) &&
			pendingLocalState === undefined;
		const fromSequenceNumber = request.headers[LoaderHeader.sequenceNumber] as
			| number
			| undefined;
		const opsBeforeReturn = request.headers[LoaderHeader.loadMode]?.opsBeforeReturn as
			| string
			| undefined;

		if (
			opsBeforeReturn === "sequenceNumber" &&
			(fromSequenceNumber === undefined || fromSequenceNumber < 0)
		) {
			// If opsBeforeReturn is set to "sequenceNumber", then fromSequenceNumber should be set to a non-negative integer.
			throw new UsageError("sequenceNumber must be set to a non-negative integer");
		} else if (opsBeforeReturn !== "sequenceNumber" && fromSequenceNumber !== undefined) {
			// If opsBeforeReturn is not set to "sequenceNumber", then fromSequenceNumber should be undefined (default value).
			// In this case, we should throw an error since opsBeforeReturn is not explicitly set to "sequenceNumber".
			throw new UsageError('opsBeforeReturn must be set to "sequenceNumber"');
		}

		let container: Container;
		if (canCache) {
			const key = this.getKeyForContainerCache(request, parsed);
			const maybeContainer = await this.containers.get(key);
			if (maybeContainer !== undefined) {
				container = maybeContainer;
			} else {
				const containerP = this.loadContainer(request, resolvedAsFluid);
				this.addToContainerCache(key, containerP);
				container = await containerP;
			}
		} else {
			container = await this.loadContainer(request, resolvedAsFluid, pendingLocalState);
		}

		return { container, parsed };
	}

	private get cachingEnabled() {
		return this.services.options.cache === true;
	}

	private async loadContainer(
		request: IRequest,
		resolvedUrl: IResolvedUrl,
		pendingLocalState?: IPendingContainerState,
	): Promise<Container> {
		return Container.load(
			{
				resolvedUrl,
				version: request.headers?.[LoaderHeader.version] ?? undefined,
				loadMode: request.headers?.[LoaderHeader.loadMode],
				pendingLocalState,
				loadToSequenceNumber: request.headers?.[LoaderHeader.sequenceNumber],
			},
			{
				canReconnect: request.headers?.[LoaderHeader.reconnect],
				clientDetailsOverride: request.headers?.[LoaderHeader.clientDetails],
				...this.services,
			},
		);
	}
}
