/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A placeholder to use in {@link https://www.typescriptlang.org/docs/handbook/2/generics.html#generic-constraints | extends constraints} when using the real type breaks compilation of some recursive types due to {@link https://github.com/microsoft/TypeScript/issues/55758 | a design limitation of TypeScript}.
 *
 * These extends constraints only serve as documentation:
 * to avoid breaking compilation, this type has to not actually enforce anything, and thus is just `unknown`.
 * Therefore the type safety is the responsibility of the user of the API.
 * @public
 */
export type Unenforced<_DesiredExtendsConstraint> = unknown;
