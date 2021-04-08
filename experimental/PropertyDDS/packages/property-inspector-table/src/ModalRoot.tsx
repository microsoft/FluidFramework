import * as React from 'react';
import { ModalConsumer } from './ModalManager';

export const ModalRoot: React.FunctionComponent = () => (
  <ModalConsumer>
    {({ component, props }) => {
      const Component = component!;
      return Component ? (<Component {...props}/>) : null;
    }}
  </ModalConsumer>
);
