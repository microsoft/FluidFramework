import React from 'react';
import clsx from 'clsx';
import TOCItems from '@theme/TOCItems';
import type {Props} from '@theme/TOC';
import TwitterIcon from "@theme/Icon/Socials/Twitter";
import Link from "@docusaurus/Link";

import styles from './styles.module.css';

// Using a custom className
// This prevents TOCInline/TOCCollapsible getting highlighted by mistake
const LINK_CLASS_NAME = 'table-of-contents__link toc-highlight';
const LINK_ACTIVE_CLASS_NAME = 'table-of-contents__link--active';

// TODO: get from site config
const githubRepoUrl = "https://github.com/microsoft/FluidFramework";
const githubDiscussionsUrl = `${githubRepoUrl}/discussions`;
const githubReportIssuesUrl = `${githubRepoUrl}/issues/new/choose`;
const githubEditUrl = "TODO";

// {{ $tweetLink := safeURL (printf "https://twitter.com/intent/tweet?original_referer=%s&ref_src=twsrc^tfw&text=%s&tw_p=tweetbutton&url=%s&via=%s" .Permalink .Title .Permalink .Site.Params.Twitterhandle )}}

// Edit this page
// ALT: Edit the source of this page in GitHub.
//   {{- if (not (in .File.Path "apis")) -}}
// {{- $editUrl := path.Join .Site.Params.Githubrepo "edit/main/docs/content/" .File.Path -}}
// {{- $editUrl = delimit (slice "https://github.com/" $editUrl) "" -}}

export default function TOC({className, ...props}: Props): JSX.Element {
  return (
    <div className={clsx(styles.tableOfContents, 'thin-scrollbar', className)}>
      <TOCItems
        {...props}
        linkClassName={LINK_CLASS_NAME}
        linkActiveClassName={LINK_ACTIVE_CLASS_NAME}
      />
      <div className='table-of-contents table-of-contents__left-border' style={{
        display: 'flex',
        flexDirection: 'column',
      }}>
        <Link to="TODO" className={LINK_CLASS_NAME}>
          <TwitterIcon />&nbsp;&nbsp;Tweet this link
        </Link>
        <Link to={githubDiscussionsUrl} className={LINK_CLASS_NAME} aria-label='Ask questions on GitHub.'>
          💬 Ask questions
        </Link>
        <Link to={githubReportIssuesUrl} className={LINK_CLASS_NAME} aria-label='Report issues on GitHub.'>
          🐛 Report issues
        </Link>
        <Link to={githubEditUrl} className={LINK_CLASS_NAME} aria-label='Edit the source of this page on GitHub.'>
          ✏️ Edit this page
        </Link>
      </div>
    </div>
  );
}
