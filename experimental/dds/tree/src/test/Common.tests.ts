/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { memoizeGetter } from '../Common';

describe('SharedTree common', () => {
	it('function memoizeGetter() correctly memoizes', () => {
		let x = 0;
		const getAndInc = () => x++;
		const obj = {
			get getUncached(): number {
				return getAndInc();
			},
			get getCached(): number {
				return memoizeGetter(this, 'getCached', getAndInc());
			},
		};

		expect(obj.getUncached).to.equal(0);
		expect(obj.getUncached).to.equal(1);
		expect(obj.getCached).to.equal(2);
		expect(obj.getCached).to.equal(2); // Cached, no increment
	});
});
