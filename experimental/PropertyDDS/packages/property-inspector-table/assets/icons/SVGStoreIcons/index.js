/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
const context = require.context("./", false, /\.svg$/i);

// keys() returns all possible matching targets within "./" that don't include sub-directories and have an svg extension.
export default context.keys().reduce((svgs, currentSvg) => {

  // This takes just the file name without the extension from the current svg.
  const keyName = /^\.\/(.*)\.svg$/.exec(currentSvg)[1];

  // This requires the current svg from the context (applies all webpack configuration for it)
  svgs[keyName] = context(currentSvg);
  return svgs;
}, {});
