/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import nconf from "nconf";

import * as blobs from "./git/blobs";
import * as commits from "./git/commits";
import * as refs from "./git/refs";
import * as tags from "./git/tags";
import * as trees from "./git/trees";
import * as repositoryCommits from "./repository/commits";
import * as contents from "./repository/contents";
import * as headers from "./repository/headers";

export interface IRoutes {
	git: {
		blobs: Router;
		commits: Router;
		refs: Router;
		tags: Router;
		trees: Router;
	};
	repository: {
		commits: Router;
		contents: Router;
		headers: Router;
	};
}

export function create(store: nconf.Provider): Router {
	const apiRoutes = {
		git: {
			blobs: blobs.create(store),
			commits: commits.create(store),
			refs: refs.create(store),
			tags: tags.create(store),
			trees: trees.create(store),
		},
		repository: {
			commits: repositoryCommits.create(store),
			contents: contents.create(store),
			headers: headers.create(store),
		},
	};

	const router: Router = Router();
	router.use(apiRoutes.git.blobs);
	router.use(apiRoutes.git.refs);
	router.use(apiRoutes.git.tags);
	router.use(apiRoutes.git.trees);
	router.use(apiRoutes.git.commits);
	router.use(apiRoutes.repository.commits);
	router.use(apiRoutes.repository.contents);
	router.use(apiRoutes.repository.headers);

	return router;
}
