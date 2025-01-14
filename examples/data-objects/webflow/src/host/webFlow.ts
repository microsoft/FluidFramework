/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/legacy";

import { FlowDocument } from "../document/index.js";
import { hostType } from "../package.js";

export class WebFlow extends DataObject {
	private static readonly factory = new DataObjectFactory<WebFlow>(
		hostType,
		WebFlow,
		[],
		{},
		new Map([FlowDocument.getFactory().registryEntry]),
	);

	public static getFactory(): IFluidDataStoreFactory {
		return WebFlow.factory;
	}

	protected async initializingFirstTime() {
		const doc = await FlowDocument.getFactory().createChildInstance(this.context);
		this.root.set("doc", doc.handle);
	}

	public async getFlowDocument() {
		return this.root.get<IFluidHandle<FlowDocument>>("doc").get();
	}
}
