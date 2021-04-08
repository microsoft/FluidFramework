import { InspectorDecorator } from './InspectorDecorator';
import { storiesOf } from '@storybook/react';
import * as React from 'react';
import { InspectorTableDecorator } from './InspectorTableDecorator';
import { EditReferencePath } from './EditReferencePath';

storiesOf('EditReferencePath', module)
  .addDecorator(InspectorDecorator)
  .addDecorator(InspectorTableDecorator)
  .add('default', () => {
    return (
      <div style={{border: '1px solid rgba(1,1,1,0)', width: '600px', height: '400px'}}>
        <EditReferencePath onCancel={() => {}} onEdit={() => { console.log("Hello"); return Promise.resolve()}} name={'dummy'} path={'dummyPath'} style={{width: '600px'}}/>
      </div>
    );
  },
);