/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Link from "@docusaurus/Link";
import Heading from "@theme/Heading";
import GitHubIcon from "@theme/Icon/Socials/GitHub";
import clsx from "clsx";
import React from "react";

import DiscussionIcon from "@site/static/assets/community/discussion.svg";
import ReportIssuesIcon from "@site/static/assets/community/report-issues.svg";

import "@site/src/css/community.css";

// TODO: it probably makes more sense to inline this stuff into `Community.mdx`

interface CommunityLinkItem {
	title: string;
	Icon: React.ComponentType<React.ComponentProps<"svg">>;
	description: JSX.Element;
	linkUrl: string;
}

const links: CommunityLinkItem[] = [
	{
		title: "Contribute",
		Icon: GitHubIcon,
		description: <>We welcome code and documentation contributions from the community.</>,
		linkUrl: "https://github.com/microsoft/FluidFramework",
	},
	{
		title: "Ask Technical Questions",
		Icon: DiscussionIcon,
		description: (
			<>
				Our GitHub Discussions are a great way to participate. Feel free to ask questions
				or, if you can, give us a hand by answering some.
			</>
		),
		linkUrl: "https://www.github.com/Microsoft/fluidframework/discussions",
	},
	{
		title: "Report Issues",
		Icon: ReportIssuesIcon,
		description: (
			<>
				Found something not working as expected? Please file a GitHub issue, so we can take
				a look together.
			</>
		),
		linkUrl: "https://www.github.com/Microsoft/fluidframework/issues",
	},
];

export default function CommunityLinks(): JSX.Element {
	return (
		<section className={"ffcom-community-links"}>
			<div className="container">
				<div className="row">
					{links.map((props, idx) => (
						<CommunityLink key={idx} {...props} />
					))}
				</div>
			</div>
		</section>
	);
}

function CommunityLink({
	title,
	Icon,
	description,
	linkUrl: href,
}: CommunityLinkItem): React.ReactElement {
	return (
		<div className={clsx("col col--4")}>
			<div className="text--center">
				<Icon className={"ffcom-community-link-icon"} role="img" />
			</div>
			<div className="text--center padding-horiz--md">
				<Heading as="h3">
					<Link href={href}>{title}</Link>
				</Heading>
				<p>{description}</p>
			</div>
		</div>
	);
}
