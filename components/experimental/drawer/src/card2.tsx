/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import {
    DocumentCard,
    DocumentCardActivity,
    DocumentCardDetails,
    DocumentCardPreview,
    DocumentCardTitle,
    IDocumentCardPreviewProps,
    DocumentCardType,
    IDocumentCardActivityPerson,
    // eslint-disable-next-line import/no-internal-modules
} from "office-ui-fabric-react/lib/DocumentCard";
// eslint-disable-next-line import/no-internal-modules
import { Stack, IStackTokens } from "office-ui-fabric-react/lib/Stack";
import { getTheme } from "office-ui-fabric-react";

/* eslint-disable max-len */
const people: IDocumentCardActivityPerson[] = [
    { name: "Annie Lindqvist", profileImageSrc: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-female.png" },
    { name: "Roko Kolar", profileImageSrc: "", initials: "RK" },
    { name: "Aaron Reid", profileImageSrc: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-male.png" },
    { name: "Christian Bergqvist", profileImageSrc: "", initials: "CB" },
];
/* eslint-enable max-len */

export class DocumentCardCompactExample extends React.PureComponent {
    public render(): JSX.Element {
        const previewProps: IDocumentCardPreviewProps = {
            getOverflowDocumentCountText: (overflowCount: number) => `+${overflowCount} more`,
            /* eslint-disable max-len */
            previewImages: [
                {
                    name: "Revenue stream proposal fiscal year 2016 version02.pptx",
                    linkProps: {
                        href: "http://bing.com",
                        target: "_blank",
                    },
                    previewImageSrc: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/document-preview.png",
                    iconSrc: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/icon-ppt.png",
                    width: 144,
                },
                {
                    name: "New Contoso Collaboration for Conference Presentation Draft",
                    linkProps: {
                        href: "http://bing.com",
                        target: "_blank",
                    },
                    previewImageSrc: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/document-preview.png",
                    iconSrc: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/icon-ppt.png",
                    width: 144,
                },
                {
                    name: "Spec Sheet for design",
                    linkProps: {
                        href: "http://bing.com",
                        target: "_blank",
                    },
                    previewImageSrc: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/document-preview.png",
                    iconSrc: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/icon-ppt.png",
                    width: 144,
                },
                {
                    name: "Contoso Marketing Presentation",
                    linkProps: {
                        href: "http://bing.com",
                        target: "_blank",
                    },
                    previewImageSrc: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/document-preview.png",
                    iconSrc: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/icon-ppt.png",
                    width: 144,
                },
            ],
        };
        /* eslint-enable max-len */

        const theme = getTheme();
        const { palette, fonts } = theme;

        const previewPropsUsingIcon: IDocumentCardPreviewProps = {
            previewImages: [
                {
                    // eslint-disable-next-line max-len
                    previewIconProps: { iconName: "OpenFile", styles: { root: { fontSize: fonts.superLarge.fontSize, color: palette.white } } },
                    width: 144,
                },
            ],
            styles: { previewIcon: { backgroundColor: palette.themePrimary } },
        };

        const previewOutlookUsingIcon: IDocumentCardPreviewProps = {
            previewImages: [
                {
                    previewIconProps: {
                        iconName: "OutlookLogo",
                        styles: {
                            root: {
                                fontSize: fonts.superLarge.fontSize,
                                color: "#0078d7",
                                backgroundColor: palette.neutralLighterAlt,
                            },
                        },
                    },
                    width: 144,
                },
            ],
            styles: {
                previewIcon: { backgroundColor: palette.neutralLighterAlt },
            },
        };

        const stackTokens: IStackTokens = { childrenGap: 20 };

        return (
            <Stack tokens={stackTokens}>
                {/* Document preview */}
                <DocumentCard type={DocumentCardType.compact} onClickHref="http://bing.com">
                    <DocumentCardPreview previewImages={[previewProps.previewImages[0]]} />
                    <DocumentCardDetails>
                        <DocumentCardTitle
                            title="Revenue stream proposal fiscal year 2016 version02.pptx"
                            shouldTruncate={true} />
                        <DocumentCardActivity activity="Created a few minutes ago" people={[people[1]]} />
                    </DocumentCardDetails>
                </DocumentCard>

                {/* Folder or site activity */}
                <DocumentCard type={DocumentCardType.compact} onClickHref="http://bing.com">
                    <DocumentCardPreview {...previewProps} />
                    <DocumentCardDetails>
                        <DocumentCardTitle title="4 files were uploaded" shouldTruncate={true} />
                        <DocumentCardActivity activity="Created a few minutes ago" people={[people[0]]} />
                    </DocumentCardDetails>
                </DocumentCard>

                {/* Card with icon */}
                <DocumentCard type={DocumentCardType.compact} onClickHref="http://bing.com">
                    <DocumentCardPreview {...previewPropsUsingIcon} />
                    <DocumentCardDetails>
                        <DocumentCardTitle title="View and share files" shouldTruncate={true} />
                        <DocumentCardActivity activity="Created a few minutes ago" people={[people[2]]} />
                    </DocumentCardDetails>
                </DocumentCard>

                {/* Email conversation */}
                <DocumentCard type={DocumentCardType.compact} onClickHref="http://bing.com">
                    <DocumentCardPreview {...previewOutlookUsingIcon} />
                    <DocumentCardDetails>
                        <DocumentCardTitle
                            title="Conversation about takeaways from annual SharePoint conference"
                            shouldTruncate={true} />
                        <DocumentCardActivity activity="Sent a few minutes ago" people={[people[3]]} />
                    </DocumentCardDetails>
                </DocumentCard>
            </Stack>
        );
    }
}
