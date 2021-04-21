/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrefetchingCheckout } from '../PrefetchingCheckout';
import { checkoutTests } from './Checkout.tests';

checkoutTests('PrefetchingCheckout', async (tree) => PrefetchingCheckout.load(tree, () => true));
