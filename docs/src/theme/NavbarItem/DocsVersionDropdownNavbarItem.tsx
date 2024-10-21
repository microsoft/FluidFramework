import React from 'react';

import { useActiveDocContext } from '@docusaurus/plugin-content-docs/client';
import type { WrapperProps } from '@docusaurus/types';
import DocsVersionDropdownNavbarItem from '@theme-original/NavbarItem/DocsVersionDropdownNavbarItem';
import type DocsVersionDropdownNavbarItemType from '@theme/NavbarItem/DocsVersionDropdownNavbarItem';

type Props = WrapperProps<typeof DocsVersionDropdownNavbarItemType>;

/**
 * Wraps the default DocsVersionDropdownNavbarItem to omit the drop-down on non-versioned pages.
 *
 * @remarks
 * Suggested workaround for lack of version dropdown customization.
 * See {@link https://github.com/facebook/docusaurus/issues/4389}.
 */
export default function DocsVersionDropdownNavbarItemWrapper(props: Props): JSX.Element {
  // Do not display this navbar item if current page is not a doc
  const activeDocContext = useActiveDocContext(props.docsPluginId);
  if (!activeDocContext.activeDoc) {
    return <></>;
  }

  return <DocsVersionDropdownNavbarItem {...props} />;
}
