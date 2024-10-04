import clsx from "clsx";
import React from "react";

import XIcon from "@theme/Icon/Socials/X";
import GitHubIcon from "@theme/Icon/Socials/GitHub";
import Link from "@docusaurus/Link";
import FooterLogo from "./Logo";

import "@site/src/css/footer.css";

// TODO: get from site config
const githubRepoUrl = "https://github.com/microsoft/FluidFramework";
const githubDiscussionsUrl = `${githubRepoUrl}/discussions`;
const githubReportIssuesUrl = `${githubRepoUrl}/issues/new/choose`;

const xUrl = "https://x.com/fluidframework";

function Footer(): JSX.Element {
	return (
		<footer
			className={clsx("footer", {
				"footer--dark": true,
			})}
		>
			<div className="footer-social">
				<LinkItem targetUrl={xUrl} ariaLabel="Fluid Framework on X (Twitter).">
					<XIcon /> @fluidframework
				</LinkItem>
				<LinkItem targetUrl={githubRepoUrl} ariaLabel="Fluid Framework on GitHub.">
					<GitHubIcon /> fluid-framework
				</LinkItem>
				<LinkItem targetUrl={githubDiscussionsUrl} ariaLabel='Ask questions on GitHub.'>
					💬 Ask questions
				</LinkItem>
				<LinkItem targetUrl={githubReportIssuesUrl} ariaLabel='Report issues on GitHub.'>
					🐛 Report issues
				</LinkItem>
			</div>
			<div className="footer-copyright">
				<FooterLogo
					src="https://storage.fluidframework.com/static/images/microsoft-logo.png"
					href="https://www.microsoft.com/"
					width={200}
					alt="Microsoft Logo"
				/>
				<div className="footer__copyright">
					{`Copyright © ${new Date().getFullYear()} Microsoft`}
				</div>
			</div>
			<div className="footer-privacy">
				<LinkItem targetUrl="https://privacy.microsoft.com/privacystatement">Privacy</LinkItem>
				<LinkItem targetUrl="https://go.microsoft.com/fwlink/?linkid=2259814">
					Consumer Health Privacy
				</LinkItem>
				<LinkItem targetUrl="https://www.microsoft.com/legal/terms-of-use">
					Terms of Use
				</LinkItem>
				<LinkItem targetUrl="https://github.com/microsoft/FluidFramework/blob/main/LICENSE">
					License
				</LinkItem>
			</div>
		</footer>
	);
}

interface LinkItemProps {
	children?: React.ReactNode;
	targetUrl: string;
	ariaLabel?: string;
}

function LinkItem({ ariaLabel, children, targetUrl }: LinkItemProps): JSX.Element {
	return (
		<Link className="footer__link-item" to={targetUrl} aria-label={ariaLabel}>
			{children}
		</Link>
	);
}

export default React.memo(Footer);
