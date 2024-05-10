/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	SchemaFactory,
	TreeConfiguration,
	type ITree2,
	type ImplicitFieldSchema,
	type TreeView,
} from "@fluidframework/tree";

const builder = new SchemaFactory("com.contoso.app.inventory");

export class Part extends builder.object("Part", {
	name: builder.string,
	quantity: builder.number,
}) {}
export class Inventory extends builder.object("Inventory", {
	parts: builder.array(Part),
}) {}

export const treeConfiguration = new TreeConfiguration(
	Inventory,
	() =>
		new Inventory({
			parts: [
				{
					name: "nut",
					quantity: 0,
				},
				{
					name: "bolt",
					quantity: 0,
				},
			],
		}),
);

// This it outside the package so it fails to build since implementing this interface is blocked.
const bad: ITree2 = {
	schematize<TRoot extends ImplicitFieldSchema>(
		config: TreeConfiguration<TRoot>,
	): TreeView<TRoot> {
		throw new Error("Function not implemented.");
	},
	id: "",
	attributes: undefined as any,
	getAttachSummary(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: any | undefined,
	): any {
		throw new Error("Function not implemented.");
	},
	async summarize(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: any | undefined,
		incrementalSummaryContext?: any | undefined,
	): Promise<any> {
		throw new Error("Function not implemented.");
	},
	isAttached(): boolean {
		throw new Error("Function not implemented.");
	},
	connect(services: any): void {
		throw new Error("Function not implemented.");
	},
	getGCData(fullGC?: boolean | undefined): any {
		throw new Error("Function not implemented.");
	},
	handle: undefined as any,
	IFluidLoadable: undefined as any,
};
