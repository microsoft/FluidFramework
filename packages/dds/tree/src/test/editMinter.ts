/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type {
	DefaultChangeFamily,
	DefaultChangeset,
	DefaultEditBuilder,
} from "../feature-libraries/index.js";

export type Editor = (builder: DefaultEditBuilder) => void;

export function makeEditMinter(
	family: DefaultChangeFamily,
	editor: Editor,
): () => DefaultChangeset {
	let builtChangeset: DefaultChangeset | undefined;
	const innerEditor = family.buildEditor((change) => {
		assert(builtChangeset === undefined);
		builtChangeset = change;
	});
	return (): DefaultChangeset => {
		assert(builtChangeset === undefined);
		editor(innerEditor);
		assert(builtChangeset !== undefined);
		const changeset = builtChangeset;
		builtChangeset = undefined;
		return changeset;
	};
}
