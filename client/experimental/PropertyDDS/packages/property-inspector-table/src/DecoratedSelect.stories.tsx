/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { storiesOf } from '@storybook/react';
import * as React from 'react';
import {
  DecoratedSelect,
  DecoratedSelectGroupedOptionsType,
  DecoratedSelectOptionsType,
  IDecoratedSelectOptionType
} from './DecoratedSelect';
import * as TableIcons from './icons';
import { InspectorDecorator } from './InspectorDecorator';
import { TypeIcon } from './TypeIcon';


storiesOf('DecoratedSelect', module)
  .addDecorator(InspectorDecorator)
  .add('single with icon', () => {
    const Float32Icon: React.ReactNode = TableIcons.getIconFromTypeId('Float32');
    const StringIcon: React.ReactNode = TableIcons.getIconFromTypeId('String');
    return (
      <div style={{ border: '1px solid rgba(1,1,1,0)', width: '400px', fontFamily: 'sans-serif' }}>
        <DecoratedSelect
          options={
            [
              { value: 'Float32', label: 'Float32', icon: Float32Icon },
              { value: 'String', label: 'String', icon: StringIcon },
            ]
          }
        />
      </div>
    );
  })

  .add('different objects assignable to icon', () => {
    const StringIcon: React.ReactNode = TableIcons.getIconFromTypeId('String');
    const BoolIcon: React.ReactNode = <TypeIcon typeId={'Bool'} />;
    const ReferenceIcon: React.ReactNode = <div> (string instead of icon) </div>;

    const options: DecoratedSelectOptionsType = [
      { value: 'String', label: 'String', icon: StringIcon },
      { value: 'Bool', label: 'Bool', icon: BoolIcon },
      { value: 'Reference', label: 'Reference', icon: ReferenceIcon },
    ];

    return (
      <div style={{ border: '1px solid rgba(1,1,1,0)', width: '400px', fontFamily: 'sans-serif' }}>
        <DecoratedSelect
          options={options}
        />
      </div>
    );
  })

  .add('groups with icon', () => {
    // Four different examples of what can be assigned to the icon.
    const Float32Icon: React.ReactNode = <TypeIcon typeId={'Float32'} />;
    const StringIcon: React.ReactNode = <TypeIcon typeId={'String'} />;
    const BoolIcon: React.ReactNode = <TypeIcon typeId={'Bool'} />;
    const ReferenceIcon: React.ReactNode = <TypeIcon typeId={'Reference'} />;

    const optionA: IDecoratedSelectOptionType = { value: 'Float32', label: 'Float32', icon: Float32Icon };
    const optionB: IDecoratedSelectOptionType = { value: 'String', label: 'String', icon: StringIcon };

    const someOptions: DecoratedSelectOptionsType = [optionA, optionB];

    const moreOptions: DecoratedSelectOptionsType = [
      { value: 'Bool', label: 'Bool', icon: BoolIcon },
      { value: 'Reference', label: 'Reference', icon: ReferenceIcon },
    ];

    const groupedOptions: DecoratedSelectGroupedOptionsType = [
      {
        label: 'Some Group of Options',
        options: someOptions,
      },
      {
        label: 'Another Group of Options',
        options: moreOptions,
      },
    ];

    return (
      <div style={{ border: '1px solid rgba(1,1,1,0)', width: '400px', fontFamily: 'sans-serif' }}>
        <DecoratedSelect
          options={groupedOptions}
        />
      </div>
    );
  });
