import { About } from "./About";
import { Analytics } from "./Analytics";
import { Logout } from "./Logout";
import * as React from 'react';
import { slide as Menu} from 'react-burger-menu';
import { Route, HashRouter, NavLink } from "react-router-dom";
import { Tenants } from "./Tenants";
import { MenuWrap } from "./MenuWrap";

export interface IContentState {
    menuOpen: boolean;
}

export interface IContentProps {
    data: any;
    user: any;
}

export class Content extends React.Component<IContentProps, IContentState> {
    constructor (props: IContentProps) {
      super(props);
      this.state = {
        menuOpen: false,
      };
    }

    handleMenuStateChange(state) {
        this.setState({menuOpen: state.isOpen});
    }

    closeMenu () {
        this.setState({menuOpen: false})
    }

    getItems() {
      let items = [
        <NavLink onClick={() => this.closeMenu()} key="1" exact to="/"><a><i className="fa fa-fw fa-star-o" /><span>Tenants</span></a></NavLink>,
        <NavLink onClick={() => this.closeMenu()} key="2" to="/analytics"><a><i className="fa fa-fw fa-bar-chart-o" /><span>Analytics</span></a></NavLink>,
        <NavLink onClick={() => this.closeMenu()} key="3" to="/about"><a><i className="fa fa-fw fa-envelope-o" /><span>About</span></a></NavLink>,
      ];
      return items;
    }

    getMenu() {
      const jsx = (
        <MenuWrap wait={20} side={'left'}>
          <Menu id={'slide'}
                pageWrapId={'page-wrap'}
                outerContainerId={'outer-container'}
                isOpen={this.state.menuOpen}
                onStateChange={(state) => this.handleMenuStateChange(state)}
          >
            {this.getItems()}
          </Menu>
        </MenuWrap>
      );
      return jsx;
    }

    render() {
      return (
        <HashRouter>
            <div id="outer-container" style={{height: '100%'}}>
            {this.getMenu()}
            <main id="page-wrap">
                <Logout name={this.props.user.displayName}/>
                <div>
                    <Route exact path={"/"} component={() => <Tenants data={this.props.data.tenants} />}/>
                    <Route path="/analytics" component={Analytics}/>
                    <Route path="/about" component={About}/>
                </div>
            </main>
            </div>
        </HashRouter>
      );
    }
  }