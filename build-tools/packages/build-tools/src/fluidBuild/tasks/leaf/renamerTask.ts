/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { globFn } from "../../../common/utils";
import { LeafTask } from "./leafTask";

/**
 * This task enables caching of the results of renaming ESM types files, which we do in our build pipeline to work
 * around a limitation in tsc-multi.
 *
 * This implementation is deliberately unintelligent. It assumes that .d.ts files are renamed to .d.mts in the lib
 * folder. Since renaming files doesn't leave the source files around, this implementation simply checks for the
 * existence of any files to rename.
 */
export class RenameTypesTask extends LeafTask {
	protected checkLeafIsUpToDate(): Promise<boolean> {
		return globFn("lib/**/*.d.ts").then((files) => files.length === 0);
	}
	protected get isIncremental() {
		return true;
	}
	protected get taskWeight() {
		return 0; // generally cheap relative to other tasks
	}
}
