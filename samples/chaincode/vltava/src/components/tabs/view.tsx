/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
import * as React from "react";

import "react-tabs/style/react-tabs.css";

import { EmbeddedComponentWrapper } from "../library";
import { ITabsDataModel, TabComponents } from "./dataModel";
import { NewTabButton } from "./newTabButton";

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
                <TabPanel key={id}  >
                    <EmbeddedComponentWrapper id={id} getComponent={this.props.dataModel.getComponent} />
                </TabPanel>);
        });

        return (
            <Tabs
                style={{ display: "flex", flexDirection: "column"}}
                selectedIndex={this.state.tabIndex}
                onSelect={(tabIndex) => this.setState({ tabIndex })}>
                <TabList>
                    {tabs}
                    <li className="react-tabs__tab">
                        <NewTabButton createTab={this.createNewTab}/>
                    </li>
                </TabList>
                <div style={{position: "relative"}}>
                    {tabPanel}
                </div>
            </Tabs>
        );
    }

    private async createNewTab(type: TabComponents) {
        await this.props.dataModel.createTab(type);
    }
}

