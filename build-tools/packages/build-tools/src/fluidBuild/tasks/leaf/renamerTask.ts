/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { globFn } from "../../../common/utils";
import { LeafWithFileStatDoneFileTask } from "./leafTask";

/**
 * This task enables caching of the results of renaming ESM types files, which we do in our build pipeline to work
 * around a limitation in tsc-multi.
 *
 * This implementation is deliberately unintelligent. It assumes that .d.ts files are renamed to .d.mts in the lib
 * folder. Since renaming files doesn't leave the source files around, this implementation fakes source files by
 * treating the .d.ts files in the dist folder as the input and the renamed files in the lib folder as the output. This
 * is safe because any time the output in the dist folder is updated then it's very likely the lib folder would also
 * need to be updated for other reasons. In other words this shouldn't cause a lot of unnecessary cache invalidation.
 */
export class RenameTypesTask extends LeafWithFileStatDoneFileTask {
	protected getInputFiles(): Promise<string[]> {
		return globFn("dist/**/*.d.ts");
	}
	protected getOutputFiles(): Promise<string[]> {
		return globFn("lib/**/*.d.mts");
	}
	protected get taskWeight() {
		return 0; // generally cheap relative to other tasks
	}
}
