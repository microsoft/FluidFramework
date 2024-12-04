/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Link from "@docusaurus/Link";
import { useBaseUrlUtils } from "@docusaurus/useBaseUrl";
import type { Props } from "@theme/Footer/Logo";
import ThemedImage from "@theme/ThemedImage";
import clsx from "clsx";
import React from "react";

import styles from "./styles.module.css";

function LogoImage({ logo }: Props): React.ReactElement {
	const { withBaseUrl } = useBaseUrlUtils();
	const sources = {
		light: withBaseUrl(logo.src),
		dark: withBaseUrl(logo.srcDark ?? logo.src),
	};
	return (
		<ThemedImage
			className={clsx("footer__logo", logo.className)}
			alt={logo.alt}
			sources={sources}
			width={logo.width}
			height={logo.height}
			style={logo.style}
		/>
	);
}

export default function FooterLogo(logo: Props): JSX.Element {
	// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
	return logo.href ? (
		<Link href={logo.href} className={styles.footerLogoLink} target={logo.target}>
			<LogoImage logo={logo} />
		</Link>
	) : (
		<LogoImage logo={logo} />
	);
}
