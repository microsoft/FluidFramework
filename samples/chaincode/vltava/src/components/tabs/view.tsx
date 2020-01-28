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
    ids: string[];
    tabIndex: number;
}

export class TabsView extends React.Component<ITabsViewProps, ITabsViewState> {
    constructor(props: ITabsViewProps) {
        super(props);

        const ids=props.dataModel.getTabIds();
        this.state = {
            ids,
            tabIndex: 0,
        };

        props.dataModel.on("newTab", () => this.setState({ids: props.dataModel.getTabIds()}));
    }

    render() {
        const tabs: JSX.Element[] = [];
        const tabPanel: JSX.Element[] = [];
        Array.from(this.state.ids).forEach((id) => {
            tabs.push(
                <Tab key={id}>
                    {id.substring(0,3)}
                </Tab>);
            tabPanel.push(
                <TabPanel key={id}>
                    <div>{id}</div>
                </TabPanel>);
        });

        return (
            <Tabs
                selectedIndex={this.state.tabIndex}
                onSelect={(tabIndex) => this.setState({ tabIndex })}>
                <TabList>
                    {tabs}
                    <span
                        style={{paddingLeft:"5px", cursor:"pointer"}}
                        onClick={() => this.props.dataModel.createTab()}>➕</span>
                </TabList>
                {tabPanel}
            </Tabs>
        );
    }
}

