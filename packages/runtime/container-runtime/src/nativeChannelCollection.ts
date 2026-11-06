/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import type {
	FluidObject,
	IFluidHandle,
	IRequest,
	IResponse,
} from "@fluidframework/core-interfaces";
import type {
	IFluidHandleContext,
	IFluidHandleInternal,
} from "@fluidframework/core-interfaces/internal";
import type {
	IDataStore,
	IFluidDataStoreChannelCollection,
	IFluidDataStoreFactory,
	IFluidDataStoreFactoryInternal,
	IFluidDataStoreRegistry,
	IGarbageCollectionData,
	ISummaryTreeWithStats,
	ITelemetryContext,
	IRuntimeMessageCollection,
	IInboundSignalMessage,
	IEnvelope,
} from "@fluidframework/runtime-definitions/internal";
import {
	addBlobToSummary,
	GCDataBuilder,
	generateHandleContextPath,
	toFluidHandleInternal,
} from "@fluidframework/runtime-utils/internal";
import { DataCorruptionError, UsageError } from "@fluidframework/telemetry-utils/internal";
import { gte } from "semver-ts";

import {
	ComposableChannelCollection,
	formParentContext,
	type IFluidParentContextPrivate,
} from "./channelCollection.js";
import {
	LocalDetachedFluidDataStoreContext,
	type FluidDataStoreContext,
} from "./dataStoreContext.js";
import { ContainerMessageType } from "./messageTypes.js";

const aliasesBlob = ".aliases";

/**
 * A collection with an addressable parent and aggregate garbage-collection lifetime.
 * @internal
 */
export class NativeChannelCollection
	extends ComposableChannelCollection
	implements IFluidDataStoreChannelCollection
{
	private visible = false;
	private readonly boundHandles = new Set<IFluidHandleInternal>();

	private constructor(
		private readonly context: FluidDataStoreContext,
		registry: IFluidDataStoreRegistry | undefined,
		aliases: Map<string, string>,
		provideEntryPoint: (collection: IFluidDataStoreChannelCollection) => Promise<FluidObject>,
	) {
		const routing: IFluidHandleContext = {
			get IFluidHandleContext() {
				return this;
			},
			absolutePath: generateHandleContextPath(context.id, context.IFluidHandleContext),
			routeContext: context.IFluidHandleContext,
			get isAttached() {
				return context.attachState !== AttachState.Detached;
			},
			attachGraph: () => this.makeVisibleAndAttachGraph(),
			resolveHandle: async (request) => this.request(request),
		};
		const parent = formParentContext<IFluidParentContextPrivate>(
			context,
			{
				submitMessage: (type, content, metadata) => {
					const message = this.toLegacyMessage(type, content);
					context.submitMessage(message.type, message.content, metadata);
				},
				submitSignal: (type, content, target, relativeAddress) => {
					if (
						relativeAddress !== undefined &&
						this.contexts.get(relativeAddress)?.isSharedObjectChannel === true
					) {
						context.submitSignal(type, content, target);
					} else {
						context.submitSignal(type, content, target, relativeAddress);
					}
				},
			},
			{ handleContext: routing, registry, leafChannelPackagePath: context.packagePath },
		);
		super(
			context.baseSnapshot,
			parent,
			context.baseLogger,
			// Usage and deletion are tracked at the containing top-level data store.
			() => {},
			() => false,
			aliases,
			async () => provideEntryPoint(this),
		);
		this.visible = context.baseSnapshot !== undefined;
	}

	public static async load(
		context: FluidDataStoreContext,
		registry: IFluidDataStoreRegistry | undefined,
		provideEntryPoint: (collection: IFluidDataStoreChannelCollection) => Promise<FluidObject>,
	): Promise<NativeChannelCollection> {
		const hasCompositeChildren = Object.values(context.baseSnapshot?.trees ?? {}).some(
			(tree) =>
				tree.blobs[".component"] !== undefined && tree.blobs[".attributes"] === undefined,
		);
		if (
			(hasCompositeChildren || context.baseSnapshot?.blobs[aliasesBlob] !== undefined) &&
			!gte(context.oldestSupportedClient, "3.12.0")
		) {
			throw new UsageError(
				"This collection contains features requiring oldestSupportedClient >= 3.12.0",
			);
		}
		const aliases = new Map<string, string>();
		const blob = context.baseSnapshot?.blobs[aliasesBlob];
		if (blob !== undefined) {
			const buffer = await context.storage.readBlob(blob);
			const data: unknown = JSON.parse(new TextDecoder().decode(buffer));
			if (!Array.isArray(data)) {
				throw new DataCorruptionError("Invalid native channel aliases", {});
			}
			for (const entry of data) {
				if (
					!Array.isArray(entry) ||
					entry.length !== 2 ||
					typeof entry[0] !== "string" ||
					typeof entry[1] !== "string"
				) {
					throw new DataCorruptionError("Invalid native channel alias entry", {});
				}
				aliases.set(entry[0], entry[1]);
			}
		}
		return new NativeChannelCollection(context, registry, aliases, provideEntryPoint);
	}

	public async createDataStore(
		factory: IFluidDataStoreFactory,
		id?: string,
	): Promise<IDataStore> {
		if (this.disposed) {
			throw new UsageError("Cannot create a child in a disposed collection");
		}
		const nativeFactory: IFluidDataStoreFactoryInternal = factory;
		if (
			nativeFactory.isLeafChannel !== true &&
			!gte(this.context.oldestSupportedClient, "3.12.0")
		) {
			throw new UsageError("Nested data stores require oldestSupportedClient >= 3.12.0");
		}
		const childId = id ?? `_${this.createDataStoreId()}`;
		if (
			childId.length === 0 ||
			childId.includes("/") ||
			this.contexts.has(childId) ||
			this.aliases.has(childId)
		) {
			throw new UsageError("Invalid or duplicate child channel ID");
		}
		const context = this.createContext(
			childId,
			[...this.context.packagePath, factory.type],
			LocalDetachedFluidDataStoreContext,
			undefined,
			nativeFactory.isLeafChannel === true,
		);
		const channel = await factory.instantiateDataStore(context, false);
		const store = await context.attachRuntime(factory, channel);
		return {
			entryPoint: store.entryPoint,
			trySetAlias: async (alias) => {
				if (!gte(this.context.oldestSupportedClient, "3.12.0")) {
					throw new UsageError(
						"Nested channel aliases require oldestSupportedClient >= 3.12.0",
					);
				}
				return store.trySetAlias(alias);
			},
		};
	}

	public async getDataStoreEntryPoint(id: string): Promise<IFluidHandleInternal<FluidObject>> {
		await this.waitIfPendingAlias(id);
		const context = this.contexts.get(this.internalId(id));
		if (context === undefined) {
			throw new UsageError(`Child channel does not exist: ${id}`);
		}
		const channel = await context.realize();
		return channel.entryPoint;
	}

	public bind(handle: IFluidHandle): void {
		if (this.disposed) {
			throw new UsageError("Cannot bind a handle to a disposed collection");
		}
		const internal = toFluidHandleInternal(handle);
		if (this.visible) {
			internal.attachGraph();
		} else {
			this.boundHandles.add(internal);
		}
	}

	public override makeVisibleAndAttachGraph(): void {
		if (this.visible) {
			return;
		}
		this.visible = true;
		for (const handle of this.boundHandles) {
			handle.attachGraph();
		}
		this.boundHandles.clear();
		this.context.makeLocallyVisible();
	}

	protected override makeDataStoreLocallyVisible(id: string): void {
		super.makeDataStoreLocallyVisible(id);
		this.makeVisibleAndAttachGraph();
	}

	public override async request(request: IRequest): Promise<IResponse> {
		if (request.url === "" || request.url === "/") {
			return { status: 200, mimeType: "fluid/object", value: await this.entryPoint.get() };
		}
		return super.request(request);
	}

	private toLegacyMessage(type: string, content: unknown): { type: string; content: unknown } {
		if (type === ContainerMessageType.FluidDataStoreOp) {
			const envelope = readEnvelope(content);
			if (this.contexts.get(envelope.address)?.isSharedObjectChannel === true) {
				const message = readOperation(envelope.contents);
				const leaf = readEnvelope(message.content);
				return { type: "op", content: { address: envelope.address, contents: leaf.contents } };
			}
		}
		return { type, content };
	}

	private toNativeMessage(type: string, content: unknown): { type: string; content: unknown } {
		if (type === "op") {
			const envelope = readEnvelope(content);
			return {
				type: ContainerMessageType.FluidDataStoreOp,
				content: {
					address: envelope.address,
					contents: { type: "op", content: { address: "", contents: envelope.contents } },
				},
			};
		}
		return { type, content };
	}

	public override processMessages(collection: IRuntimeMessageCollection): void {
		const type =
			collection.envelope.type === "op"
				? ContainerMessageType.FluidDataStoreOp
				: collection.envelope.type;
		super.processMessages({
			...collection,
			envelope: { ...collection.envelope, type },
			messagesContent: collection.messagesContent.map((message) => ({
				...message,
				contents: this.toNativeMessage(collection.envelope.type, message.contents).content,
			})),
		});
	}

	public override reSubmit(
		type: string,
		content: unknown,
		metadata: unknown,
		squash: boolean,
	): void {
		const message = this.toNativeMessage(type, content);
		super.reSubmit(message.type, message.content, metadata, squash);
	}

	public override rollback(type: string, content: unknown, metadata: unknown): void {
		const message = this.toNativeMessage(type, content);
		super.rollback(message.type, message.content, metadata);
	}

	public override processSignal(message: IInboundSignalMessage, local: boolean): void {
		const routed: IInboundSignalMessage & { relativeAddress?: string | undefined } = message;
		if (routed.relativeAddress === undefined) {
			for (const [, context] of this.contexts) {
				if (context.isSharedObjectChannel) {
					context.processSignal(message, local);
				}
			}
		} else {
			super.processSignal(
				{
					...message,
					content: { address: routed.relativeAddress, contents: message.content },
				},
				local,
			);
		}
	}
	public override async applyStashedOp(message: unknown): Promise<unknown> {
		if (
			typeof message !== "object" ||
			message === null ||
			!("type" in message) ||
			!("content" in message)
		) {
			throw new DataCorruptionError("Invalid stashed collection operation", {});
		}
		if (typeof message.type !== "string") {
			throw new DataCorruptionError("Invalid stashed collection operation type", {});
		}
		const native = this.toNativeMessage(message.type, message.content);
		return super.applyStashedOp({ type: native.type, contents: native.content });
	}

	public override async summarize(
		fullTree: boolean,
		trackState: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats> {
		const summary = await super.summarize(fullTree, trackState, telemetryContext);
		if (this.aliases.size > 0) {
			addBlobToSummary(summary, aliasesBlob, JSON.stringify([...this.aliases]));
		}
		return summary;
	}

	public override getAttachSummary(
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		const summary = super.getAttachSummary(telemetryContext);
		if (this.aliases.size > 0) {
			addBlobToSummary(summary, aliasesBlob, JSON.stringify([...this.aliases]));
		}
		return summary;
	}

	public override async getGCData(fullGC?: boolean): Promise<IGarbageCollectionData> {
		return this.withAggregateLifetime(await super.getGCData(fullGC));
	}

	public override getAttachGCData(
		telemetryContext?: ITelemetryContext,
	): IGarbageCollectionData {
		return this.withAggregateLifetime(super.getAttachGCData(telemetryContext));
	}

	private withAggregateLifetime(data: IGarbageCollectionData): IGarbageCollectionData {
		const builder = new GCDataBuilder();
		builder.addNodes(data.gcNodes);
		const path = this.parentContext.IFluidHandleContext.absolutePath;
		builder.addRouteToAllNodes(path);
		const children: string[] = [];
		for (const [id] of this.contexts) {
			if (!this.contexts.isNotBound(id)) {
				children.push(`${path}/${id}`);
			}
		}
		builder.addNode("/", children);
		return builder.getGCData();
	}
}

function readEnvelope(value: unknown): IEnvelope<unknown> {
	if (
		typeof value !== "object" ||
		value === null ||
		!("address" in value) ||
		typeof value.address !== "string" ||
		!("contents" in value)
	) {
		throw new DataCorruptionError("Invalid channel envelope", {});
	}
	return { address: value.address, contents: value.contents };
}

function readOperation(value: unknown): { content: unknown } {
	if (
		typeof value !== "object" ||
		value === null ||
		!("type" in value) ||
		value.type !== "op" ||
		!("content" in value)
	) {
		throw new DataCorruptionError("Invalid leaf operation", {});
	}
	return { content: value.content };
}
