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

  "aqueduct": "framework",
  "framework-definitions": "framework",

  "container-definitions": "loader",
  "container-loader": "loader",
  "loader-web": "loader",

  "routerlicious-socket-storage": "driver",
  "socket-storage-shared": "driver",
  "odsp-socket-storage": "driver",
  "file-socket-storage": "driver",

  "utils": "misc",
}

var groupNames = {
  runtime: "Runtime",
  dds: "Distributed Data Structure",
  framework: "Framework",
  loader: "Loader",
  driver: "Driver",
  misc: "Misc",
  unknown: "Unknown",
};

/**
 * This method will be called at the start of exports.transform in toc.html.js
 */
exports.preTransform = function (model) {
  if (model.items && model.items.length > 0) {
    var groupedPackages = {};
    for (var group in groupNames) {
      groupedPackages[group] = [];
    }
    var hasGrouped = false;
    model.items.forEach(function(element) {
      var group = packageMapping[element.name];
      if (group === undefined || groupedPackages[group] === undefined) {
        group = "unknown";
      } else {
        hasGrouped = true;
      }
      groupedPackages[group].push(element);
    });

    if (hasGrouped) {
      model.items = [];
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