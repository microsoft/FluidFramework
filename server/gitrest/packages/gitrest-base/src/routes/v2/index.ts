/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import nconf from "nconf";
import { IFileSystemManagerFactories, IRepositoryManagerFactory } from "../../utils";
/* eslint-disable import/no-internal-modules */
import * as refs from "./git/refs";
import * as repos from "./git/repos";
import * as repositoryCommits from "./repository/commits";
/* eslint-enable import/no-internal-modules */
import * as summaries from "./summaries";

export interface IRoutes {
	git: {
		refs: Router;
		repos: Router;
	};
	repository: {
		commits: Router;
	};
	summaries: Router;
}

export function create(
	store: nconf.Provider,
	fileSystemManagerFactories: IFileSystemManagerFactories,
	repoManagerFactory: IRepositoryManagerFactory,
): IRoutes {
	return {
		git: {
			refs: refs.create(store, fileSystemManagerFactories, repoManagerFactory),
			repos: repos.create(store, repoManagerFactory),
		},
		repository: {
			commits: repositoryCommits.create(
				store,
				fileSystemManagerFactories,
				repoManagerFactory,
			),
		},
		summaries: summaries.create(store, fileSystemManagerFactories, repoManagerFactory),
	};
}
