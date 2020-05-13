/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

export interface IMenuWrapState {
    hidden: boolean;
}

export interface IMenuWrapProps {
    side: string;
    wait: any;
    children: any;
}

export class MenuWrap extends React.Component<IMenuWrapProps, IMenuWrapState> {
    constructor(props: IMenuWrapProps) {
      super(props);
      this.state = {
        hidden: false,
      };
    }

    // TODO: Clean up this method later.
    public componentWillReceiveProps(nextProps) {
      const sideChanged = this.props.children.props.right !== nextProps.children.props.right;

      if (sideChanged) {
        this.setState({hidden : true});

        setTimeout(() => {
          this.show();
        }, this.props.wait);
      }
    }

    public show() {
      this.setState({hidden : false});
    }

    public hide() {
        this.setState({hidden : true});
    }

    public render() {
      let style;

      if (this.state.hidden) {
        style = {display: "none"};
      }

      return (
        <div style={style} className={this.props.side}>
          {this.props.children}
        </div>
      );
    }
  }
