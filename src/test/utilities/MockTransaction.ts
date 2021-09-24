/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Result } from '../../Common';
import { ChangeResult, EditStatus, GenericTransaction, GenericTransactionPolicy } from '../../generic';
import { RevisionView } from '../../TreeView';

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
	export function factory<TChange>(
		view: RevisionView,
		options: Options = defaultOptions
	): GenericTransaction<TChange> {
		return new GenericTransaction(view, new Policy<TChange>(options));
	}

	/**
	 * A mock implementation of `GenericTransaction` for use in tests.
	 * @internal
	 */
	export class Policy<TChange> implements GenericTransactionPolicy<TChange> {
		public options: Options;

		public constructor(options: Options) {
			this.options = options;
		}

		public tryResolveChange(state, change: TChange): Result.Ok<TChange> {
			return Result.ok(change);
		}

		public validateOnClose(state): ChangeResult {
			return this.options.statusOnClose === EditStatus.Applied
				? Result.ok(state.view)
				: Result.error({ status: this.options.statusOnClose, failure: undefined });
		}

		public dispatchChange(state): ChangeResult {
			return Result.ok(state.view);
		}
	}
}
