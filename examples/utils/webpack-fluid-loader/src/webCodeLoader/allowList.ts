/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedFluidCodeDetails } from "@fluidframework/container-definitions";

/**
 * Class used by hosts to allow specific containers and endpoint.
 */
export class AllowList {
	constructor(
		private readonly testHandler?: (source: IResolvedFluidCodeDetails) => Promise<boolean>,
	) {}

	public async testSource(source: IResolvedFluidCodeDetails): Promise<boolean> {
		if (this.testHandler === undefined) {
			return true;
		}
		return this.testHandler(source);
	}
}
