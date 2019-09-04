/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from 'react';
import {
    DocumentCard,
    DocumentCardActivity,
    DocumentCardPreview,
    DocumentCardTitle,
    IDocumentCardPreviewProps
} from 'office-ui-fabric-react/lib/DocumentCard';
import { ImageFit } from 'office-ui-fabric-react/lib/Image';

export interface IDocumentCardBasicExampleProps {
    pkg: string,
    name: string,
    version: string,
    icon: string,
    url: string
}

export class DocumentCardBasicExample extends React.Component<IDocumentCardBasicExampleProps> {
    public render(): JSX.Element {
        const simpleName = this.props.url.substr(this.props.url.lastIndexOf("/") + 1);
        const previewProps: IDocumentCardPreviewProps = {
            previewImages: [
                {
                    name: simpleName,
                    linkProps: {
                        href: this.props.url,
                        target: '_blank'
                    },
                    previewIconProps: {
                        iconName: this.props.icon,
                        style: { fontSize: "180px" },
                    },
                    imageFit: ImageFit.cover,
                    width: 318,
                    height: 196
                }
            ]
        };

        return (
            <DocumentCard onClick={(event) => { window.open(this.props.url, "_blank")}}>
                <DocumentCardPreview {...previewProps} />
                <DocumentCardTitle
                    title={simpleName}
                    shouldTruncate={true}
                />
                <DocumentCardActivity
                    activity="Created a few minutes ago"
                    people={[{
                        name: 'Annie Lindqvist',
                        profileImageSrc: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-female.png",
                    }]}
                />
            </DocumentCard>
        );
    }
}
