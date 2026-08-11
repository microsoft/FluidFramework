/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type FieldKey, type UpPath, topDownPath } from "../core/index.js";

/**
 * A step in a bind path
 */
interface PathStep {
	/**
	 * The field being traversed
	 */
	readonly field: FieldKey;

	/**
	 * The index of the element being navigated to
	 */
	readonly index?: number;
}

/**
 * A top down path in a bind or path tree is a collection of {@link PathStep}s
 *
 * see {@link BindTree}
 * see {@link UpPath}
 */
export type DownPath = PathStep[];

/**
 * Compute a top-town {@link DownPath} from an {@link UpPath}.
 */
export function toDownPath(upPath: UpPath): DownPath {
	const downPath: UpPath[] = topDownPath(upPath);
	const stepDownPath: PathStep[] = downPath.map((u) => {
		return { field: u.parentField, index: u.parentIndex };
	});
	stepDownPath.shift(); // remove last step to the root node
	return stepDownPath;
}
