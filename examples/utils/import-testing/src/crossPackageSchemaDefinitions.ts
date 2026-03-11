/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
Schema definitions that import the factory from a separate file (crossPackageSchemaUtils.ts).
This separation is critical: it forces the .d.ts to resolve tree/alpha types through a deeper
chain, which triggers TypeScript's type resolution bug when tree's export tiers share a JS module.
*/

/* eslint-disable jsdoc/require-jsdoc */

import { sf } from "./crossPackageSchemaUtils.js";

export class Position extends sf.objectAlpha("Position", {
	x: sf.number,
	y: sf.number,
}) {}

export class Dimensions extends sf.objectAlpha("Dimensions", {
	width: sf.number,
	height: sf.number,
}) {}

export class Container extends sf.objectAlpha("Container", {
	id: sf.string,
	position: Position,
	dimensions: sf.optional(Dimensions),
}) {}

export class AppState extends sf.objectAlpha("AppState", {
	containers: sf.mapAlpha("ContainerMap", Container),
	labels: sf.mapAlpha("LabelMap", sf.string),
}) {}
