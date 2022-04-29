/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";

type showModalSignature = <T>(component: React.ComponentType<T>, props: T, closeHandler?: () => void) => void;
interface IModalContext<P = any> {
  /**
   * A custom close handler that is invoked when the modal is closed.
   */
  closeHandler?: () => void;
  /**
   * Modal type currently being displayed. The string is matched to a React.Component
   */
  component: React.ComponentType<P> | null;
  /**
   * Props passed down to the shown modal
   */
  props: any;
  hideModal: () => void;
  showModal: showModalSignature;
}
export const ModalContext = React.createContext<IModalContext>({
  closeHandler: undefined,
  component: null,
  hideModal: () => { return; },
  props: {},
  showModal: () => { return; },
});

// eslint-disable-next-line @typescript-eslint/ban-types
export class ModalManager extends React.Component<{}, IModalContext> {
  constructor(props) {
    super(props);
    this.state = {
      closeHandler: undefined,
      component: null,
      hideModal: this.hideModal,
      props: {},
      showModal: this.showModal,
    };
  }

  public render() {
    return (
      <ModalContext.Provider value={this.state}>
        {this.props.children}
      </ModalContext.Provider>
    );
  }

  private readonly showModal = (component, props, closeHandler?) => {
    this.setState({
      closeHandler,
      component,
      props,
    });
  };

  private readonly hideModal = () => {
    if (this.state.closeHandler) {
      this.state.closeHandler();
    }
    this.setState({
      closeHandler: undefined,
      component: null,
      props: {},
    });
  };
}

export const ModalConsumer = ModalContext.Consumer;
