/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { storiesOf } from '@storybook/react';
import * as React from 'react';
import { InspectorDecorator } from './InspectorDecorator';
import { InspectorTableDecorator } from './InspectorTableDecorator';
import { IInspectorRow } from './InspectorTableTypes';
import { NewDataForm } from './NewDataForm';

storiesOf('NewDataForm', module)
  .addDecorator(InspectorDecorator)
  .addDecorator(InspectorTableDecorator)
  .add('default', () => {
    return (
      <div style={{border: '1px solid rgba(1,1,1,0)', width: '400px', fontFamily: 'sans-serif'}}>
          <NewDataForm
            onCancelCreate={() => alert('onCancelCreate called')}
            onDataCreate={(rowData: IInspectorRow, name: string, typeid: string, context: string) =>
              alert(
                'onDataCreate called with the following parameters:' +
                '\nname: ' + name +
                '\ntypeid: ' + typeid +
                '\ncontext: ' + context)
            }
            options={
              [
                ['Primitives', [
                  { value: 'Float32', label: 'Float32' },
                  { value: 'Float64', label: 'Float64' },
                  { value: 'Int16', label: 'Int16' },
                  { value: 'Int32', label: 'Int32' },
                  { value: 'Int64', label: 'Int64' },
                  { value: 'Int8', label: 'Int8' },
                  { value: 'Uint16', label: 'Uint16' },
                  { value: 'Uint32', label: 'Uint32' },
                  { value: 'Uint64', label: 'Uint64' },
                  { value: 'Uint8', label: 'Uint8' },
                  { value: 'String', label: 'String' },
                  { value: 'Bool', label: 'Bool' },
                  { value: 'Reference', label: 'Reference' },
                  { value: 'NodeProperty', label: 'NodeProperty' },
                ]],
              ]
            }
            rowData={{
              children: undefined,
              context: "d",
              id: "d",
              isConstant: false,
              isReference: false,
              name: "d",
              parentId: "d",
              parentIsConstant: false,
              propertyId: "d",
              typeid: "d",
              value: "d",
            }}
          />
      </div>
    );
  },
);
