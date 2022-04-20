/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Result } from '../../Common';
import { ChangeInternal, EditStatus } from '../../persisted-types';
import { RevisionView } from '../../RevisionView';
import {
	ChangeResult,
	GenericTransaction,
	GenericTransactionPolicy,
	TransactionInternal,
} from '../../TransactionInternal';

/**
 * @internal
 */
export namespace MockTransaction {
	export interface Options {
		statusOnClose: EditStatus;
	}

	export const defaultOptions: Options = {
		statusOnClose: EditStatus.Applied,
	};

	/**
	 * Makes a new {@link GenericTransaction} that follows the {@link MockTransaction.Policy} policy.
	 *
	 * @internal
	 */
	export function factory(view: RevisionView, options: Options = defaultOptions): GenericTransaction {
		return new GenericTransaction(view, new Policy(options));
	}

	/**
	 * A mock implementation of `GenericTransaction` for use in tests.
	 * @internal
	 */
	export class Policy implements GenericTransactionPolicy {
		public options: Options;

		public constructor(options: Options) {
			this.options = options;
		}

		public tryResolveChange(_state, change: ChangeInternal): Result.Ok<ChangeInternal> {
			return Result.ok(change);
		}

		public validateOnClose(state): ChangeResult {
			return this.options.statusOnClose === EditStatus.Applied
				? Result.ok(state.view)
				: Result.error({
						status: this.options.statusOnClose,
						failure: undefined as unknown as TransactionInternal.Failure,
				  });
		}

		public dispatchChange(state): ChangeResult {
			return Result.ok(state.view);
		}
	}
}
