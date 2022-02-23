/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { EditStatus } from '../generic';
import { ReconciliationEdit } from '../ReconciliationPath';
import { initialRevisionViewWithValidation, refreshTestTree } from './utilities/TestUtilities';
import { MockTransaction } from './utilities/MockTransaction';

describe('GenericTransaction', () => {
	const testTree = refreshTestTree();
	it('does not read the reconciliation path when change resolution does not require it', () => {
		const trappedPath = new Proxy([] as ReconciliationEdit<unknown>[], {
			get: (target, prop): unknown => {
				expect('the path was read').equals('the path should not be read');
				return target[prop];
			},
		});
		const transaction = MockTransaction.factory<unknown>(initialRevisionViewWithValidation, testTree);
		transaction.applyChanges([{}, {}], trappedPath);
		expect(transaction.status).equals(EditStatus.Applied);
	});

	it('reflects failure status when validateOnClose is not successful', () => {
		const transaction = MockTransaction.factory<unknown>(initialRevisionViewWithValidation, testTree, {
			statusOnClose: EditStatus.Invalid,
		});
		const result = transaction.close();
		expect(result.status).equals(EditStatus.Invalid);
		expect(transaction.status).equals(EditStatus.Invalid);
	});
});
