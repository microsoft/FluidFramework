/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from 'react';

import { CommandBar } from 'office-ui-fabric-react/lib/CommandBar';
import { ContextualMenuItemType } from 'office-ui-fabric-react/lib/ContextualMenu';

export class DrawerCommandBar extends React.Component<{}, {}> {
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

    // Data for CommandBar
    private getItems = () => {
        return [
            {
                key: 'newItem',
                name: 'New',
                cacheKey: 'myCacheKey', // changing this key will invalidate this items cache
                iconProps: {
                    iconName: 'Add'
                },
                ariaLabel: 'New',
                subMenuProps: {
                    items: [
                        {
                            key: 'Folder',
                            name: 'Folder',
                            iconProps: {
                                iconName: 'FabricNewFolder'
                            }
                        },
                        {
                            key: 'divider_1',
                            itemType: ContextualMenuItemType.Divider,
                        },
                        {
                            key: 'FlowView',
                            name: 'Flow View',
                            iconProps: {
                                iconName: 'TextDocument'
                            }
                        },
                        {
                            key: 'SMDE',
                            name: 'SMDE',
                            iconProps: {
                                iconName: 'MarkDownLanguage'
                            }
                        },
                        {
                            key: 'Monaco',
                            name: 'Monaco',
                            iconProps: {
                                iconName: 'Code'
                            }
                        },
                    ]
                }
            },
            {
                key: 'share',
                name: 'Share',
                iconProps: {
                    iconName: 'Share'
                },
                onClick: () => console.log('Share')
            }
        ];
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
