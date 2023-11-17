/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	SchemaFactory,
	TreeFieldFromImplicitField,
	TreeNodeFromImplicitAllowedTypes,
	TreeNodeSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../class-tree/schemaFactory";
import { areSafelyAssignable, requireAssignableTo, requireTrue } from "../../util";

const schema = new SchemaFactory("Blah");

class Note extends schema.object("Note", { text: schema.string }) {}

class NodeMap extends schema.map("Notes", Note) {}
class NodeList extends schema.list("Notes", Note) {}

function f(n: NodeMap): void {
	const item = n.get("x");
}

// Leaf stuff
{
	const x = schema.string;
	type _check = requireAssignableTo<typeof schema.string, TreeNodeSchema>;
}

// TreeNodeFromImplicitAllowedTypes
{
	type _check = requireAssignableTo<typeof Note, TreeNodeSchema>;
	type Test = TreeNodeFromImplicitAllowedTypes<typeof Note>;
	type Instance = InstanceType<typeof Note>;
	type _check2 = requireTrue<areSafelyAssignable<Test, Note>>;

	type _check3 = requireTrue<
		areSafelyAssignable<TreeNodeFromImplicitAllowedTypes<[typeof Note]>, Note>
	>;
	type _check4 = requireTrue<
		areSafelyAssignable<TreeNodeFromImplicitAllowedTypes<[() => typeof Note]>, Note>
	>;

	type FromArray = TreeNodeFromImplicitAllowedTypes<[typeof Note, typeof Note]>;
	type _check5 = requireTrue<areSafelyAssignable<FromArray, Note>>;
}

// TreeFieldFromImplicitField
{
	type _check = requireAssignableTo<typeof Note, TreeNodeSchema>;
	type Test = TreeFieldFromImplicitField<typeof Note>;
	type Instance = InstanceType<typeof Note>;
	type _check2 = requireTrue<areSafelyAssignable<Test, Note>>;

	type _check3 = requireTrue<
		areSafelyAssignable<TreeFieldFromImplicitField<[typeof Note]>, Note>
	>;
	type _check4 = requireTrue<
		areSafelyAssignable<TreeFieldFromImplicitField<[() => typeof Note]>, Note>
	>;

	type FromArray = TreeFieldFromImplicitField<[typeof Note, typeof Note]>;
	type _check5 = requireTrue<areSafelyAssignable<FromArray, Note>>;
}
