/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from 'react';

import { CommandBar, ICommandBarItemProps } from 'office-ui-fabric-react/lib/CommandBar';
import { ContextualMenuItemType, IContextualMenuItem } from 'office-ui-fabric-react/lib/ContextualMenu';
import { IDocumentFactory } from '@prague/host-service-interfaces';
import { IFluidCodeDetails } from '@prague/container-definitions';
import { ISharedMap } from '@prague/map';
import { IComponentContext } from '@prague/runtime-definitions';

interface IDrawerCommandBarProps {
    context: IComponentContext,
    packages: { pkg: string, name: string, version: string, icon: string }[],
    documentFactory: IDocumentFactory,
    documentsMap: ISharedMap,
}

export class DrawerCommandBar extends React.Component<IDrawerCommandBarProps, {}> {
    public render(): JSX.Element {
        return (
            <div>
                <CommandBar
                    items={this.getItems()}
                    overflowButtonProps={{ ariaLabel: 'More commands' }}
                    farItems={this.getFarItems()}
                    ariaLabel={'Use left and right arrow keys to navigate between commands'}
                />
            </div>
        );
    }

    private async createDocument(details: { pkg: string, name: string, version: string, icon: string }) {
        const chaincode: IFluidCodeDetails = {
            config: {
                "@chaincode:cdn": "https://pragueauspkn-3873244262.azureedge.net",
            },
            package: `${details.pkg}@${details.version}`,
        };

        const context = this.props.context;
        const clientId = context.clientId;
        const member = context.getQuorum().getMember(clientId);
        const user = member ? member.client.user : {};

        const name = await this.props.documentFactory.create(chaincode);
        this.props.documentsMap.set(name, { ...details, user, date: Date.now() });
    }

    // Data for CommandBar
    private getItems = () => {
        const items: IContextualMenuItem[] = this.props.packages.map((value) => {
            return {
                key: value.pkg,
                name: value.name,
                iconProps: {
                    iconName: value.icon,
                },
                onClick: () => {
                    this.createDocument(value);
                },
            }
        });

        items.splice(
            1,
            0,
            {
                key: 'divider_1',
                itemType: ContextualMenuItemType.Divider,
            });

        const result: ICommandBarItemProps[] = [
            {
                key: 'newItem',
                name: 'New',
                cacheKey: 'myCacheKey', // changing this key will invalidate this items cache
                iconProps: {
                    iconName: 'Add'
                },
                ariaLabel: 'New',
                subMenuProps: {
                    items
                },
            },
            {
                key: 'share',
                name: 'Share',
                iconProps: {
                    iconName: 'Share'
                },
                onClick: () => console.log('Share')
            }];

        return result;
    };

    private getFarItems = () => {
        return [
            {
                key: 'info',
                name: 'Info',
                ariaLabel: 'Info',
                iconProps: {
                    iconName: 'Info'
                },
                iconOnly: true,
                onClick: () => console.log('Info')
            }
        ];
    };
}
