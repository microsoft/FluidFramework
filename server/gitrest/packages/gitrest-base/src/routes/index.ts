/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import nconf from "nconf";
import { IFileSystemManagerFactories, IRepositoryManagerFactory } from "../utils";
/* eslint-disable import/no-internal-modules */
import * as blobs from "./git/blobs";
import * as commits from "./git/commits";
import * as refs from "./git/refs";
import * as repos from "./git/repos";
import * as tags from "./git/tags";
import * as trees from "./git/trees";
import * as repositoryCommits from "./repository/commits";
import * as contents from "./repository/contents";
/* eslint-enable import/no-internal-modules */
import * as summaries from "./summaries";

export interface IRoutes {
	git: {
		blobs: Router;
		commits: Router;
		refs: Router;
		repos: Router;
		tags: Router;
		trees: Router;
	};
	repository: {
		commits: Router;
		contents: Router;
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
			blobs: blobs.create(store, fileSystemManagerFactories, repoManagerFactory),
			commits: commits.create(store, fileSystemManagerFactories, repoManagerFactory),
			refs: refs.create(store, fileSystemManagerFactories, repoManagerFactory),
			repos: repos.create(store, repoManagerFactory),
			tags: tags.create(store, fileSystemManagerFactories, repoManagerFactory),
			trees: trees.create(store, fileSystemManagerFactories, repoManagerFactory),
		},
		repository: {
			commits: repositoryCommits.create(
				store,
				fileSystemManagerFactories,
				repoManagerFactory,
			),
			contents: contents.create(store, fileSystemManagerFactories, repoManagerFactory),
		},
		summaries: summaries.create(store, fileSystemManagerFactories, repoManagerFactory),
	};
}
