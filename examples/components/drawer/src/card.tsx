/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import {
    DocumentCard,
    DocumentCardActivity,
    DocumentCardPreview,
    DocumentCardTitle,
    IDocumentCardPreviewProps,
    // eslint-disable-next-line import/no-internal-modules
} from "office-ui-fabric-react/lib/DocumentCard";
// eslint-disable-next-line import/no-internal-modules
import { ImageFit } from "office-ui-fabric-react/lib/Image";
import * as moment from "moment";

export interface IDocumentCardBasicExampleProps {
    pkg: string;
    name: string;
    version: string;
    icon: string;
    url: string;
    date: number;
    user: any;
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
                        target: "_blank",
                    },
                    previewIconProps: {
                        iconName: this.props.icon,
                        style: { fontSize: "180px" },
                    },
                    imageFit: ImageFit.cover,
                    width: 318,
                    height: 196,
                },
            ],
        };

        const name = this.props.user ? this.props.user.name : "Fluid User";
        const activity = this.props.date
            ? `Created ${moment(this.props.date).fromNow()}`
            : "Created before the existance of time";

        return (
            <DocumentCard onClick={(event) => { window.open(this.props.url, "_blank");}}>
                <DocumentCardPreview {...previewProps} />
                <DocumentCardTitle
                    title={simpleName}
                    shouldTruncate={true}
                />
                <DocumentCardActivity
                    activity={activity}
                    people={[{
                        name,
                        profileImageSrc: undefined,
                    }]}
                />
            </DocumentCard>
        );
    }
}
