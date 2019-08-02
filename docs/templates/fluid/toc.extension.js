// Copyright (c) Microsoft. All rights reserved. Licensed under the MIT license. See LICENSE file in the project root for full license information.

var packageMapping = {
  "container-runtime": "runtime",
  "component-runtime": "runtime",
  "runtime-definitions": "runtime",

  "cell": "dds",
  "map": "dds",
  "merge-tree": "dds",
  "sequence": "dds",
  "stream": "dds",
  "consensus-ordered-collection": "dds",
  "consensus-register-collection": "dds",
  "shared-object-common": "dds",

  "component-core-interfaces": "framework",
  "aqueduct": "framework",
  "framework-definitions": "framework",

  "container-definitions": "loader",
  "container-loader": "loader",
  "loader-web": "loader",
  "protocol-definitions": "loader",

  "routerlicious-socket-storage": "driver",
  "socket-storage-shared": "driver",
  "odsp-socket-storage": "driver",
  "file-socket-storage": "driver",
  "replay-socket-storage": "driver",

  "base-host": "host",
  "tiny-web-host": "host",
  "react-web-host": "host",
  
  "utils": "misc",
}

var groupNames = {
  framework: "Framework",
  dds: "Distributed Data Structure",
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
      children.forEach(function(element) {
        var group = packageMapping[element.name];
        if (group === undefined || groupedPackages[group] === undefined) {
          group = "unknown";
        }
        groupedPackages[group].push(element);
      });

      model.items = [ overview ];
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