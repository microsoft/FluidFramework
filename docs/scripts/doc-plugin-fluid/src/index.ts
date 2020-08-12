// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IApiDocumenterPluginManifest } from '@microsoft/api-documenter';
import { FluidFeature } from './FluidFeature';

export const apiDocumenterPluginManifest: IApiDocumenterPluginManifest = {
  manifestVersion: 1000,
  features: [
    {
      featureName: 'fluid-markdown-documenter',
      kind: 'MarkdownDocumenterFeature',
      subclass: FluidFeature
    }
  ]
};
