import { About } from "./About";
import { Analytics } from "./Analytics";
import * as React from 'react';
import { slide as Menu} from 'react-burger-menu';
import { Route, HashRouter, NavLink } from "react-router-dom";
import { Tenants } from "./Tenants";
import { MenuWrap } from "./MenuWrap";

export interface IContentState {
    currentMenu: string;
    side: string;
    menuOpen: boolean;
}

export interface IContentProps {
    side: string;
    menus: any;
    data: any;
}

export class Content extends React.Component<IContentProps, IContentState> {
    constructor (props: IContentProps) {
      super(props);
      this.state = {
        currentMenu: 'slide',
        menuOpen: false,
        side: 'left'
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

    // TODO: No need to if else here.
    getMenu() {
      const items = this.getItems();
      let jsx;

      if (this.state.side === 'right') {
        jsx = (
          <MenuWrap wait={20} side={this.state.side}>
            <Menu id={this.state.currentMenu} pageWrapId={'page-wrap'} outerContainerId={'outer-container'} right>
              {items}
            </Menu>
          </MenuWrap>
        );
      } else {
        jsx = (
          <MenuWrap wait={20} side={this.state.side}>
            <Menu id={this.state.currentMenu}
                  pageWrapId={'page-wrap'}
                  outerContainerId={'outer-container'}
                  isOpen={this.state.menuOpen}
                  onStateChange={(state) => this.handleMenuStateChange(state)}
            >
              {items}
            </Menu>
          </MenuWrap>
        );
      }

      return jsx;
    }

    render() {
      return (
        <HashRouter>
            <div id="outer-container" style={{height: '100%'}}>
            {this.getMenu()}
            <main id="page-wrap">
                <div>
                    <Route exact path="/" component={Tenants}/>
                    <Route path="/analytics" component={Analytics}/>
                    <Route path="/about" component={About}/>
                </div>
            </main>
            </div>
        </HashRouter>
      );
    }
  }