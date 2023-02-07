/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Plugin } from "prosemirror-state";
import { DecorationSet, Decoration } from "prosemirror-view";

// Sample from
// https://github.com/PierBover/prosemirror-cookbook

export const create = () =>
	new Plugin({
		props: {
			decorations(state) {
				const selection = state.selection;
				const resolved = state.doc.resolve(selection.from);
				const decoration = Decoration.node(resolved.before(), resolved.after(), {
					class: "selected",
				});
				// Equivalent to
				// const decoration = Decoration.node(resolved.start() - 1, resolved.end() + 1, {class: 'selected'});
				return DecorationSet.create(state.doc, [decoration]);
			},
		},
	});
