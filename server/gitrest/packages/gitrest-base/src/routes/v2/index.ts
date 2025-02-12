/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import nconf from "nconf";
import { IFileSystemManagerFactories, IRepositoryManagerFactory } from "../../utils";
import * as summaries from "./summaries";

export interface IRoutes {
	summaries: Router;
}

export function create(
	store: nconf.Provider,
	fileSystemManagerFactories: IFileSystemManagerFactories,
	repoManagerFactory: IRepositoryManagerFactory,
): IRoutes {
	return {
		summaries: summaries.create(store, fileSystemManagerFactories, repoManagerFactory),
	};
}
