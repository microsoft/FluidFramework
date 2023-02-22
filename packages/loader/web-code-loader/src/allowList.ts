/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodeAllowList, IResolvedFluidCodeDetails } from "@fluidframework/container-definitions";

/**
 * Class used by hosts to allow specific containers and endpoint.
 *
 * @deprecated 2.0.0-internal.3.2.0 Fluid does not prescribe a particular code validation approach.  Will be removed in an upcoming release.
 */
export class AllowList implements ICodeAllowList {
	/**
	 * @deprecated 2.0.0-internal.3.2.0 Fluid does not prescribe a particular code validation approach.  Will be removed in an upcoming release.
	 */
	constructor(
		private readonly testHandler?: (source: IResolvedFluidCodeDetails) => Promise<boolean>,
	) {}

	/**
	 * @deprecated 2.0.0-internal.3.2.0 Fluid does not prescribe a particular code validation approach.  Will be removed in an upcoming release.
	 */
	public async testSource(source: IResolvedFluidCodeDetails): Promise<boolean> {
		if (this.testHandler === undefined) {
			return true;
		}
		return this.testHandler(source);
	}
}
