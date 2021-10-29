/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { EditStatus } from '../generic';
import { ReconciliationEdit } from '../ReconciliationPath';
import {
	PlaceAnchorSemanticsChoice,
	RangeAnchor,
	TransactionWithAnchors,
	AnchoredChangeInternal,
} from '../anchored-edits';
import { simpleRevisionViewWithValidation, left, right } from './utilities/TestUtilities';

describe('TransactionWithAnchors', () => {
	it('does not read the reconciliation path when change resolution does not require it', () => {
		const trappedPath = new Proxy([] as ReconciliationEdit<AnchoredChangeInternal>[], {
			get: (target, prop): unknown => {
				expect('the path was read').equals('the path should not be read');
				return target[prop];
			},
		});
		const transaction = TransactionWithAnchors.factory(simpleRevisionViewWithValidation);
		transaction.applyChanges(
			[
				AnchoredChangeInternal.detach(RangeAnchor.only(left, PlaceAnchorSemanticsChoice.BoundToNode)),
				AnchoredChangeInternal.detach(RangeAnchor.only(right, PlaceAnchorSemanticsChoice.BoundToNode)),
			],
			trappedPath
		);
		expect(transaction.status).equals(EditStatus.Applied);
	});
});
