/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ValueManager } from "./internalTypes.js";
import type { IndependentValue } from "./types.js";

/**
 * @internal
 */
export function brandIVM<TManagerInterface, TValue>(
	manager: TManagerInterface & ValueManager<TValue>,
): IndependentValue<TManagerInterface> {
	return manager as TManagerInterface as IndependentValue<TManagerInterface>;
}

/**
 * @internal
 */
export function unbrandIVM<TManagerInterface, TValue>(
	branded: IndependentValue<TManagerInterface>,
): ValueManager<TValue> {
	return branded as unknown as ValueManager<TValue>;
}
