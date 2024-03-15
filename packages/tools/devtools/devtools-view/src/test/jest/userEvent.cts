/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// @testing-library/user-event is CommonJs and best imported as an affirmed CJS module (.cts)
// as has been done here. However this may not be viable trying to run directly against
// TypeScript source until ts-jest issue https://github.com/kulshekhar/ts-jest/issues/3996
// transpiling .cts files has addressed.
// Further linting might complain if this is moved back to uses unless the package default
// is set to "commonjs" or an alternate config for linting is provided with CommonJS+Bundler.

// eslint-disable-next-line import/no-named-as-default
import userEvent from "@testing-library/user-event";

// eslint-disable-next-line unicorn/prefer-export-from
export { userEvent };
