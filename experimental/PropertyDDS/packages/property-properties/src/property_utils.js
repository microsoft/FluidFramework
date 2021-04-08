var PropertyUtils = {};

/**
 * Gather all properties that pass an arbitrary predicate function
 * @param {property-properties.NodeProperty} in_rootProperty The root property to traverse from
 * @param {function} in_predicate The predicate function
 * @return {Array.<property-properties.BasePropertyy>} The list of properties that passed the predicate
 * function
 */
PropertyUtils.gatherProperties = function (in_rootProperty, in_predicate) {
    var gatheredProperties = {};
    in_rootProperty.traverseDown(function (property, path) {
        if (in_predicate(property)) {
            gatheredProperties[path] = property;
        }
    });

    return gatheredProperties;
};

module.exports = PropertyUtils;
