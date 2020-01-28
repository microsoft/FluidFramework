/* eslint-disable @typescript-eslint/quotes */
/* eslint-disable react/jsx-no-target-blank */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/indent */
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
import { Tab, Tabs, TabList } from 'react-tabs';


import * as React from "react";
import 'react-tabs/style/react-tabs.css';

export const tabsView = () => {
    return (
        <React.Fragment>
            <Router>
                <Tabs>
                    <TabList>
                        <Tab><Link to="/">Home</Link></Tab>
                        <Tab><Link to="/about">About</Link></Tab>
                        <Tab><Link to="/users">Users</Link></Tab>
                        <Link to="/users"><Tab>Users</Tab></Link>
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
        </React.Fragment >
    );
};
