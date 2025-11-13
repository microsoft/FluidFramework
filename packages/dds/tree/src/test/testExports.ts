/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file is exported outside the package via a special "./internal/test" entry point defined in the package.json.
// It should not be imported within this package.
// This is very fragile since package exports are generally assumed to have their dependencies described by the "dependencies" of the package listed in the package.json.
// This does not work for test code since it can depend on `devDependencies` of the package instead, which will not be installed by users of this package.
// Therefore this pattern is very fragile and should be avoided if possible.
// Importers of this must somehow ensure that they provide all the actual dependencies of this code.
// Currently this is used by `packages/test/local-server-stress-tests/src/ddsModels.ts`.
// TODO: Find a more robust way to meet the needs of that use-case.

// This file is not named `index.ts` to help avoid confusion and auto-completed imports of it within this package:
// This is a special case and it is not like the other index files in this package
// (such as those in the nested directories in test which reexport contents of those directories for use within this package).

export { baseTreeModel } from "./shared-tree/index.js";
