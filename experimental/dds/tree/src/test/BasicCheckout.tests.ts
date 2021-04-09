/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BasicCheckout } from '../BasicCheckout';
import { checkoutTests } from './Checkout.tests';

checkoutTests('BasicCheckout', async (tree) => Promise.resolve(new BasicCheckout(tree)));
