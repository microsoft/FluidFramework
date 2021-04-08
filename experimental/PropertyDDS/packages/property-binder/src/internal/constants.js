/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
import { BaseProperty } from '@fluid-experimental/property-properties';

/**
 * @hidden
 */
const RESOLVE_NO_LEAFS = {
  referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS
};

/**
 * @hidden
 */
const RESOLVE_ALWAYS = {
  referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.ALWAYS
};

/**
 * @hidden
 */
const RESOLVE_NEVER = {
  referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER
};

export { RESOLVE_ALWAYS, RESOLVE_NEVER, RESOLVE_NO_LEAFS };
