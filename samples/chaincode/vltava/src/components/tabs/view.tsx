/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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
        const tabs: JSX.Element[] = [];
        const tabPanel: JSX.Element[] = [];
        Array.from(this.state.ids).forEach((id) => {
            tabs.push(
                <Tab key={id}>
                    {id}
                </Tab>);
            tabPanel.push(
                <TabPanel>
                    <div>{id}</div>
                </TabPanel>);
        });

        return (
            <Tabs selectedIndex={this.state.tabIndex} onSelect={(tabIndex) => this.setState({ tabIndex })}>
                <TabList>
                    {tabs}
                    <button onClick={() => this.props.dataModel.createTab()}>➕</button>
                </TabList>
                {tabPanel}
                <TabPanel/>
            </Tabs>
        );
    }
}
