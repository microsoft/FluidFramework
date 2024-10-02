import clsx from "clsx";
import React from "react";

import TwitterIcon from "@theme/Icon/Socials/Twitter";
import GitHubIcon from "@theme/Icon/Socials/GitHub";
import Link from "@docusaurus/Link";
import FooterLogo from "./Logo";

import "@site/src/css/footer.css";

function Footer(): JSX.Element {
	return (
		<footer
			className={clsx("footer", {
				"footer--dark": true,
			})}
		>
			<div className="footer-social">
				<LinkItem targetUrl="https://twitter.com/fluidframework">
					<TwitterIcon /> @fluidframework
				</LinkItem>

				<LinkItem targetUrl="https://github.com/microsoft/FluidFramework">
					<GitHubIcon /> fluid-framework
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
}

function LinkItem({ children, targetUrl }: LinkItemProps): JSX.Element {
	return (
		<Link className="footer__link-item" to={targetUrl}>
			{children}
		</Link>
	);
}

export default React.memo(Footer);
