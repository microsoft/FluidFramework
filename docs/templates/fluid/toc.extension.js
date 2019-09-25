// Copyright (c) Microsoft. All rights reserved. Licensed under the MIT license. See LICENSE file in the project root for full license information.

var packageMapping = {
  "fluid-container-runtime": "runtime",
  "fluid-component-runtime": "runtime",
  "fluid-runtime-definitions": "runtime",

  "fluid-cell": "dds",
  "fluid-map": "dds",
  "fluid-merge-tree": "dds",
  "fluid-sequence": "dds",
  "fluid-stream": "dds",
  "fluid-ordered-collection": "dds",
  "fluid-register-collection": "dds",
  "fluid-shared-object-base": "dds",

  "fluid-component-core-interfaces": "framework",
  "fluid-aqueduct": "framework",
  "fluid-aqueduct-react": "framework",
  "fluid-framework-definitions": "framework",

  "fluid-container-definitions": "loader",
  "fluid-container-loader": "loader",
  "fluid-web-code-loader": "loader",
  "fluid-protocol-definitions": "loader",

  "fluid-routerlicious-driver": "driver",
  "fluid-driver-base": "driver",
  "fluid-odsp-driver": "driver",
  "fluid-file-driver": "driver",
  "fluid-replay-driver": "driver",

  "fluid-base-host": "host",
  "tiny-web-host": "host",
  "react-web-host": "host",

  "fluid-core-utils": "misc",
}

var groupNames = {
  framework: "Framework",
  dds: "Distributed Data Structures",
  runtime: "Runtime",
  loader: "Loader",
  driver: "Driver",
  host: "Sample Hosts",
  misc: "Misc",
  unknown: "Internal/Deprecated",
};

/**
 * This method will be called at the start of exports.transform in toc.html.js
 */
exports.preTransform = function (model) {
  if (model.items && model.items.length > 0) {
    if (model.items[0].name === "API overview") {
      var overview = model.items[0];
      var children = overview.items;
      overview.items = undefined;
      var groupedPackages = {};
      for (var group in groupNames) {
        groupedPackages[group] = [];
      }
      children.forEach(function (element) {
        var group = packageMapping[element.name];
        if (group === undefined || groupedPackages[group] === undefined) {
          group = "unknown";
        }
        groupedPackages[group].push(element);
      });

      model.items = [overview];
      for (var group in groupedPackages) {
        model.items.push(
          { name: groupNames[group], items: groupedPackages[group] }
        );
      }
    }
  }
  return model;
}

/**
 * This method will be called at the end of exports.transform in toc.html.js
 */
exports.postTransform = function (model) {
  return model;
}
