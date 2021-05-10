/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@fluid-experimental/property-common" {

  export class DeterministicRandomGenerator {
    constructor(seed: string | number);
    random(max: number | undefined);
    irandom(max: number | undefined);
  }

}
