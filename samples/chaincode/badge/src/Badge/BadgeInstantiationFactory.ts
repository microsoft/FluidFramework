/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  SimpleComponentInstantiationFactory,
} from "@prague/aqueduct";
import {
  SharedCell
} from "@prague/cell";
import {
  SharedMap,
} from "@prague/map";
import {
  SharedObjectSequence
} from "@prague/sequence";

import { Badge } from "./index";

/**
 * This is where you define all your Distributed Data Structures
 */
export const BadgeInstantiationFactory = new SimpleComponentInstantiationFactory(
  [
    SharedMap.getFactory(),
    SharedCell.getFactory(),
    SharedObjectSequence.getFactory()
  ],
  Badge.load
);
