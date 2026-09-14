/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	RunTransactionParamsAlpha,
	RunTransactionParamsBeta,
	TransactionCallbackStatusAlpha,
	TransactionCallbackStatusBeta,
	VoidTransactionCallbackStatusAlpha,
	VoidTransactionCallbackStatusBeta,
} from "../../../simple-tree/index.js";
import type { requireAssignableTo } from "../../../util/index.js";

// Type tests
{
	// TransactionCallbackStatusAlpha should be assignable to TransactionCallbackStatusBeta
	type _checkCallbackStatus = requireAssignableTo<
		TransactionCallbackStatusAlpha<unknown, unknown>,
		TransactionCallbackStatusBeta<unknown, unknown>
	>;

	// VoidTransactionCallbackStatusAlpha should be assignable to VoidTransactionCallbackStatusBeta
	type _checkVoidCallbackStatus = requireAssignableTo<
		VoidTransactionCallbackStatusAlpha,
		VoidTransactionCallbackStatusBeta
	>;

	// RunTransactionParamsAlpha should be assignable to RunTransactionParamsBeta
	type _checkRunTransactionParams = requireAssignableTo<
		RunTransactionParamsAlpha,
		RunTransactionParamsBeta
	>;
}
