/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IDataObjectProps,
	PureDataObject,
	PureDataObjectFactory,
} from "@fluidframework/aqueduct";

import type { IndependentDirectory } from "../types.js";

import { createEphemeralIndependentDirectory } from "./independentDirectory.js";

/**
 * @alpha
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export type EmptyIndependentDirectory = IndependentDirectory<{}>;

/**
 * @alpha
 */
export class EphemeralIndependentDirectory extends PureDataObject {
	public static readonly Name = "@fluidframework/ephemeral-independent-directory";

	public static readonly factory = new PureDataObjectFactory(
		EphemeralIndependentDirectory.Name,
		EphemeralIndependentDirectory,
		[],
		{},
	);

	public readonly directory: EmptyIndependentDirectory;

	public constructor(props: IDataObjectProps) {
		super(props);
		this.directory = createEphemeralIndependentDirectory(props.runtime, {});
	}
}
