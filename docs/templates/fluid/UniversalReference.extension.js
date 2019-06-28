// Copyright (c) Microsoft. All rights reserved. Licensed under the MIT license. See LICENSE file in the project root for full license information.

/**
 * This method will be called at the start of exports.transform in UniversalReference.html.primary.js
 */
exports.preTransform = function (model) {
  return model;
}

/**
 * This method will be called at the end of exports.transform in UniversalReference.html.primary.js
 */
exports.postTransform = function (model) {
  // The model is the data in the yml file after the default transform done by UniversalReference.common.js in the default template
  // The default template can be viewed via "docfx template export default" command
  if (model.isClass && model.children) {
    // Split the properties and method group into protected/static groups
    const children = [];
    const protectedChildren = [];
    model.children.forEach(function (c) {
      if (c.inMethod && c.children) {
        splitProtectStatic(children, protectedChildren, c, "Method", "methods");
      } else if (c.inProperty && c.children) {
        splitProtectStatic(children, protectedChildren, c, "Property", "properties");
      } else {
        children.push(c);
      }
    });    
    model.children = children.concat(protectedChildren)
  }
  return model;
}

function initGroup(prefix, name, idPrefix, idName) {
  const group = {};
  const inName = "in" + prefix + name;
  const id = idPrefix? idPrefix + "_" + idName : idName
  group[inName] = true;
  group.typePropertyName = inName;
  group.id = id;
  group.children = [];
  return group;

}
function splitProtectStatic(children, protectedChildren, c, name, idName) {
  const group = initGroup("", name, undefined, idName);
  const protectedGroup = initGroup("Protected", name, "protected", idName);
  const staticGroup = initGroup("Static", name, "static", idName);
  const protectedStaticGroup = initGroup("ProtectedStatic", name, "protected_static", idName);
  c.children.forEach(function (m) {
    const name = m.syntax && m.syntax.content && m.syntax.content[0]
      && m.syntax.content[0].value ? m.syntax.content[0].value : ""
    if (name.indexOf("protected static ") === 0) {
      protectedStaticGroup.children.push(m);
    } else if (name.indexOf("protected ") === 0) {
      protectedGroup.children.push(m);
    } else if (name.indexOf("static ") === 0) {
      staticGroup.children.push(m);
    } else {
      group.children.push(m);
    }
  });
  if (staticGroup.children.length > 0) {
    children.push(staticGroup);
  }
  if (group.children.length > 0) {
    children.push(group);
  }
  if (protectedStaticGroup.children.length > 0) {
    protectedChildren.push(protectedStaticGroup);
  }
  if (protectedGroup.children.length > 0) {
    protectedChildren.push(protectedGroup);
  }
}

