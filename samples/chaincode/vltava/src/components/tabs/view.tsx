/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    BrowserRouter as Router,
    Switch,
    Route,
    Link,
} from "react-router-dom";
import { Tab, Tabs, TabList, TabPanel } from "react-tabs";

import * as React from "react";

import "react-tabs/style/react-tabs.css";

import { ITabsDataModel } from "./dataModel";

export interface ITabsViewProps {
    dataModel: ITabsDataModel;
}

export interface ITabsViewState {
    ids: Iterable<string>;
    tabIndex: number;
}

export class TabsView extends React.Component<ITabsViewProps, ITabsViewState> {
    constructor(props: ITabsViewProps) {
        super(props);

        this.state = {
            ids: props.dataModel.getTabIds(),
            tabIndex: 0,
        };

        props.dataModel.on("newTab", () => this.setState({ids: props.dataModel.getTabIds()}));

        this.onTabSelected = this.onTabSelected.bind(this);
    }

    private onTabSelected(tabIndex: number, tabsCount: number) {
        if (tabIndex === tabsCount) {
            this.props.dataModel.createTab();
        }

        this.setState({ tabIndex });
    }

    render() {
        const tabs = [];
        tabs.push(<Tab>Tab 1</Tab>);

        Array.from(this.state.ids).forEach((id) => {
            tabs.push(
                <Tab>
                    <Link to={id}>
                        {id}
                    </Link>
                </Tab>);
        });

        return (
            <Router>
                <Tabs selectedIndex={this.state.tabIndex} onSelect={(index) => this.onTabSelected(index, tabs.length)}>
                    <TabList>
                        {tabs}
                        <Tab>➕</Tab>
                    </TabList>
                    <TabPanel/>
                    <TabPanel/>
                    <Switch>
                        <Route path="/about">
                            <div>about</div>
                        </Route>
                        <Route path="/users">
                            <div>users</div>
                        </Route>
                        <Route path="/">
                            <div>home</div>
                        </Route>
                    </Switch>
                </Tabs>
            </Router>
        );
    }
}
