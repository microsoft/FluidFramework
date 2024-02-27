/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactoryRecursive } from "../../simple-tree/index.js";

const sf = new SchemaFactoryRecursive("recursive");

// Objects work fine, as long as ObjectRecursive and optionalRecursive are used.
export class ObjectRecursive extends sf.objectRecursiveUnsafe("Object", {
	x: sf.optionalRecursive([() => ObjectRecursive]),
}) {}

// #region List

// Lists do not work, due to issues with the constructor input parameter
{
	// @ts-expect-error Lists fail to recurse and need listRecursive
	const ListRef = () => NodeList;
	sf.fixRecursiveReference(ListRef);
	// @ts-expect-error Lists fail to recurse and need listRecursive
	class NodeList extends sf.array("NodeList", [ListRef]) {}
}

const ListRefWrapped = () => ListRecursive;
sf.fixRecursiveReference(ListRefWrapped);
export class ListRecursive extends sf.arrayRecursive("List", [ListRefWrapped]) {}

// #endregion

// #region Map

{
	// @ts-expect-error Maps fail to recurse and need mapRecursive
	const MapRef = () => RecursiveMap;
	sf.fixRecursiveReference(MapRef);
	// @ts-expect-error Maps fail to recurse and need mapRecursive
	class RecursiveMap extends sf.map("NodeMap", [MapRef]) {}
}

const MapRef2 = () => MapRecursive;
sf.fixRecursiveReference(MapRef2);
export class MapRecursive extends sf.mapRecursive("Map", [MapRef2]) {}

// #endregion
