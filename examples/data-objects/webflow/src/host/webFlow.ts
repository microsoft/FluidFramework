/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import-x/no-internal-modules
import { DataObjectFactory } from "@fluidframework/aqueduct/internal";
import { DataObject } from "@fluidframework/aqueduct/legacy";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/legacy";

import { FlowDocument } from "../document/index.js";
import { hostType } from "../package.js";

export class WebFlow extends DataObject {
	private static readonly factory = new DataObjectFactory({
		type: hostType,
		ctor: WebFlow,
		registryEntries: new Map([FlowDocument.getFactory().registryEntry]),
	});

	public static getFactory(): IFluidDataStoreFactory {
		return WebFlow.factory;
	}

	protected async initializingFirstTime(): Promise<void> {
		const doc = await FlowDocument.getFactory().createChildInstance(this.context);
		this.root.set("doc", doc.handle);
	}

	public async getFlowDocument(): Promise<FlowDocument> {
		return this.root.get<IFluidHandle<FlowDocument>>("doc").get();
	}
}
