/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { SharedObject } from "@fluidframework/shared-object-base";
import {
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IChannelStorageService,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { ChangeConnectionState, DDSFuzzModel, type BaseOperation } from "../ddsFuzzHarness.js";

/**
 * Mock DDS which holds no data.
 * This is used for DDS Fuzz harness tests.
 *
 * In lieu of holding data, this implementation keeps track about the number and order of calls to various
 * core SharedObject methods, so that tests can assert DDSes have reasonable setup and collaboration flows.
 * It supports a single "noop" operation, which submits an op but otherwise does nothing.
 *
 * This avoids the need to spy on various harness methods/implementation details.
 */
class SharedNothing extends SharedObject {
	public processCoreCalls = 0;
	public summarizeCoreCalls = 0;
	public applyStashedOpCalls = 0;
	public loadCoreCalls = 0;
	public noopCalls = 0;
	public methodCalls: string[] = [];

	constructor(
		public readonly id: string,
		public readonly runtime: IFluidDataStoreRuntime,
		public readonly attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, "shared-nothing");
	}
	protected async loadCore(services: IChannelStorageService): Promise<void> {
		this.loadCoreCalls++;
		this.methodCalls.push("loadCore");
	}
	protected onDisconnect(): void {}
	protected applyStashedOp(): void {
		this.noop();
		this.applyStashedOpCalls++;
		this.methodCalls.push("applyStashedOp");
	}
	protected processCore(): void {
		this.processCoreCalls++;
		this.methodCalls.push("processCore");
	}
	protected summarizeCore(): ReturnType<SummaryTreeBuilder["getSummaryTree"]> {
		this.summarizeCoreCalls++;
		this.methodCalls.push("summarizeCore");
		return new SummaryTreeBuilder().getSummaryTree();
	}
	public noop(): void {
		this.noopCalls++;
		this.methodCalls.push("noop");
		this.submitLocalMessage({ type: "noop" });
	}
}

export class SharedNothingFactory implements IChannelFactory {
	public static Type = "nothing";

	public static readonly Attributes: IChannelAttributes = {
		type: SharedNothingFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: "not implemented",
	};

	public get type(): string {
		return SharedNothingFactory.Type;
	}

	public get attributes(): IChannelAttributes {
		return SharedNothingFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<SharedNothing> {
		const nothing = new SharedNothing(id, runtime, attributes);
		await nothing.load(services);
		return nothing;
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): SharedNothing {
		const nothing = new SharedNothing(id, runtime, this.attributes);
		nothing.initializeLocal();
		return nothing;
	}
}

export interface Operation {
	// no APIs can be called on SharedNothing, but to test the fuzz harness we need to be able to return
	// some type of operation.
	type: "noop";
}

const noopGenerator = async () => ({ type: "noop" }) as const;

export const isNoopOp = (op: BaseOperation): op is Operation => op.type === "noop";

export const baseModel: DDSFuzzModel<SharedNothingFactory, Operation | ChangeConnectionState> = {
	workloadName: "test",
	factory: new SharedNothingFactory(),
	generatorFactory: () => noopGenerator,
	reducer: async (state, op) => {},
	validateConsistency: () => {},
	minimizationTransforms: [],
};
