/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
import React from "react";

import { EmbeddedFluidObjectWrapper } from "../library";
import { ITabsDataModel } from "./dataModel";
import { NewTabButton } from "./newTabButton";

import "react-tabs/style/react-tabs.css";

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

        const ids = props.dataModel.getTabIds();
        this.state = {
            ids,
            tabIndex: 0,
        };

        props.dataModel.on("newTab", (local) => {
            if (local) {
                this.setState({
                    ids: props.dataModel.getTabIds(),
                    tabIndex: this.state.ids.length,
                });
            } else {
                this.setState({
                    ids: props.dataModel.getTabIds(),
                });
            }
        });

        this.createNewTab = this.createNewTab.bind(this);
    }

    public render() {
        const tabs: JSX.Element[] = [];
        const tabPanel: JSX.Element[] = [];
        Array.from(this.state.ids).forEach((id) => {
            tabs.push(
                <Tab key={id}>
                    {id.substring(0, 3)}
                </Tab>);
            tabPanel.push(
                <TabPanel key={id}>
                    <EmbeddedFluidObjectWrapper
                        getFluidObject={async () => this.props.dataModel.getFluidObjectTabView(id)}
                    />
                </TabPanel>);
        });

        return (
            <Tabs
                style={{ display: "flex", flexDirection: "column" }}
                selectedIndex={this.state.tabIndex}
                onSelect={(tabIndex) => this.setState({ tabIndex })}>
                <TabList>
                    {tabs}
                    <li className="react-tabs__tab">
                        <NewTabButton
                            createTab={this.createNewTab}
                            fluidObjects={this.props.dataModel.getNewTabTypes()} />
                    </li>
                </TabList>
                <div style={{ position: "relative" }}>
                    {tabPanel}
                </div>
            </Tabs>
        );
    }

    private async createNewTab(factory: IFluidDataStoreFactory) {
        await this.props.dataModel.createTab(factory);
    }
}
