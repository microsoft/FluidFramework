/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { ReconciliationEdit } from '../ReconciliationPath';
import { ChangeInternal, EditStatus } from '../persisted-types';
import { refreshTestTree } from './utilities/TestUtilities';
import { MockTransaction } from './utilities/MockTransaction';

describe('GenericTransaction', () => {
	const testTree = refreshTestTree();
	it('does not read the reconciliation path when change resolution does not require it', () => {
		const trappedPath = new Proxy([] as ReconciliationEdit[], {
			get: (target, prop): unknown => {
				expect('the path was read').equals('the path should not be read');
				return target[prop];
			},
		});
		const transaction = MockTransaction.factory(testTree.view);
		transaction.applyChanges([{}, {}] as unknown as ChangeInternal[], trappedPath);
		expect(transaction.status).equals(EditStatus.Applied);
	});

	it('reflects failure status when validateOnClose is not successful', () => {
		const transaction = MockTransaction.factory(testTree.view, {
			statusOnClose: EditStatus.Invalid,
		});
		const result = transaction.close();
		expect(result.status).equals(EditStatus.Invalid);
		expect(transaction.status).equals(EditStatus.Invalid);
	});
});
