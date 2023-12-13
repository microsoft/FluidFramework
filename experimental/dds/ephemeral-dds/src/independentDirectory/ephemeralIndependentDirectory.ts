/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IDataObjectProps,
	PureDataObject,
	PureDataObjectFactory,
} from "@fluidframework/aqueduct";

import { createEphemeralIndependentDirectory } from "./independentDirectory";
import type { IndependentDirectory } from "./types";

// eslint-disable-next-line @typescript-eslint/ban-types
type EmptyIndependentDirectory = IndependentDirectory<{}>;

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
