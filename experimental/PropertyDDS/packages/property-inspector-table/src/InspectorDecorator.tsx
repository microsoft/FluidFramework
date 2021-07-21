/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { MuiThemeProvider } from '@material-ui/core/styles';
import * as React from 'react';
import '../assets/icons/SVGStoreIcons';
import { theme } from './Theme';

export const InspectorDecorator = (storyFn) => (
  <MuiThemeProvider theme={theme}>
    {storyFn()}
  </MuiThemeProvider>
);
