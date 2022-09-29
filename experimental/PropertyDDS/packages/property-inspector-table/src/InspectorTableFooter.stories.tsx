/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { storiesOf } from '@storybook/react';
import * as React from 'react';
import { InspectorTableDecorator } from './InspectorTableDecorator';
import { InspectorTableFooter } from './InspectorTableFooter';
import { IInspectorTableProps } from './InspectorTableTypes';

const noop = () => { /* noop */};

const parentProps: IInspectorTableProps = {
  checkoutInProgress: false,
  columns: ['name', 'value'],
  expandColumnKey: 'name',
  followReferences: false,
  height: 600,
  rowHeight: 50,
  width: 800,
};
storiesOf('TableFooter', module)
  .addDecorator(InspectorTableDecorator)
  .add('Default', () => (
    <div style={{ width: '100%' }}>
      <InspectorTableFooter
        parentProps={parentProps}
        handleCollapseAll={noop}
        handleExpandAll={noop}
      />
    </div>
  ));
