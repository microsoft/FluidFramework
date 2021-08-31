/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeResult, EditStatus, GenericTransaction } from '../../generic';
import { RevisionView } from '../../TreeView';

/**
 * A mock implementation of `GenericTransaction` for use in tests.
 * @internal
 */
// eslint-disable-next-line import/export
export class MockTransaction<TChange> extends GenericTransaction<TChange> {
	public options: MockTransaction.Options;

	public constructor(view: RevisionView, options: MockTransaction.Options = MockTransaction.defaultOptions) {
		super(view);
		this.options = options;
	}

	public static factory<TChange>(view: RevisionView): MockTransaction<TChange> {
		return new MockTransaction<TChange>(view);
	}

	protected validateOnClose(): EditStatus {
		return this.options.statusOnClose;
	}

	protected dispatchChange(): ChangeResult {
		return this;
	}
}

/**
 * @internal
 */
// eslint-disable-next-line import/export
export namespace MockTransaction {
	export interface Options {
		statusOnClose: EditStatus;
	}

	export const defaultOptions: Options = {
		statusOnClose: EditStatus.Applied,
	};
}
