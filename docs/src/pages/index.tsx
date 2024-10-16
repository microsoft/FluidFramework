import React from "react";
import {TitleSection} from '../components/titleSection';
import Layout from '@theme/Layout';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';


export default function(): React.ReactElement {
	const {siteConfig} = useDocusaurusContext();
	return (
		<Layout
			title={`Hello from ${siteConfig.title}`}
			description="Description will go into a meta tag in <head />">
			<TitleSection />
	  </Layout>
	)
}
