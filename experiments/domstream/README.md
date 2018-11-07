Build
=====
  `npm i & npm run build`

The Chrome extension output is in the `dist/extension` directory

Component
=========

The chaincode component output is in the `dist/component` directory after build

To publish: `npm run publish-local`
To rev version and publish: `npm run publish-patch-local`


Known Issues
============

- Dynamic styles create via CSSStyleSheet.insertRule is not reflected
- Attribute with NS
- URL rewriting of style and href should be done fully
- Childlist update should be generate per mutation record (and with remove and add done separately?)
- Input radio button needs to be synced
- Support for canvas/audio/video elements
- Handle syncing back contenteditable elements

Only in "TAB" mode: 
- real implementation of HTMLUtil.htmlEncode

