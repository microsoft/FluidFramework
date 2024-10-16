import React from "react";
import {TitleSection} from '../components/TitleSection';
import Layout from '@theme/Layout';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';


export default function(): React.ReactElement {
	const {siteConfig} = useDocusaurusContext();
	return (
		<Layout
			title={`Hello from ${siteConfig.title}`}
			description="Description will go into a meta tag in <head />">
			<main>
				<TitleSection />
			</main>
	  </Layout>
	)
}
