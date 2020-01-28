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
import { Tab, Tabs, TabList } from "react-tabs";

import * as React from "react";

import "react-tabs/style/react-tabs.css";

import { ITabsDataModel } from "./dataModel";

export interface ITabsViewProps {
    dataModel: ITabsDataModel;
}

// export interface ITabsViewState {

// }

export class TabsView extends React.Component<ITabsViewProps> {
    render() {
        return (
            <Router>
                <Tabs>
                    <TabList>
                        <Tab>
                            <Link to="/">
                                Home
                            </Link>
                        </Tab>
                        <Tab>
                            <Link to="/about">
                                About
                            </Link>
                        </Tab>
                        <Tab>
                            <Link to="/users">
                                Users
                            </Link>
                        </Tab>
                    </TabList>
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
