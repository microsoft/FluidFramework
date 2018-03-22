import * as React from "react";

export interface IMenuWrapState {
    hidden: boolean;
}

export interface IMenuWrapProps {
    side: string;
    wait: any;
    children: any;
}

export class MenuWrap extends React.Component<IMenuWrapProps, IMenuWrapState> {
    constructor (props: IMenuWrapProps) {
      super(props);
      this.state = {
        hidden: false
      };
    }

    // TODO: Clean up this method later.
    componentWillReceiveProps(nextProps) {
      const sideChanged = this.props.children.props.right !== nextProps.children.props.right;

      if (sideChanged) {
        this.setState({hidden : true});

        setTimeout(() => {
          this.show();
        }, this.props.wait);
      }
    }

    show() {
      this.setState({hidden : false});
    }

    hide() {
        this.setState({hidden : true});
    }

    render() {
      let style;

      if (this.state.hidden) {
        style = {display: 'none'};
      }

      return (
        <div style={style} className={this.props.side}>
          {this.props.children}
        </div>
      );
    }
  }