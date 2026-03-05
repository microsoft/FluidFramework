/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
This file is compiled in isolation (via tsconfig.crossPackage.json) to produce .d.ts files
that are consumed by crossPackageImporter.spec.ts.

Isolation is critical: surrounding schema definitions can mask .d.ts generation failures.
By compiling only these schemas, we ensure the test accurately detects regressions in
objectAlpha/mapAlpha/optional cross-package consumption.
*/

/* eslint-disable jsdoc/require-jsdoc */

import { SchemaFactoryAlpha } from "@fluidframework/tree/alpha";

const sf = new SchemaFactoryAlpha("cross-package-example");

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
