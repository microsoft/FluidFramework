/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview
 * Declaration of the TemplateSchema module
 * The TemplateSchema is used for validating PropertySet templates that code is attempting to register
 */

/**
 * @namespace FORGE.HFDMSchemaValidator.TemplateSchema
 * @alias FORGE.HFDMSchemaValidator.TemplateSchema
 * @description Declaration of the TemplateSchema module
 *
 * Namespace containing all schema-related data for property set validation
 * @ignore
 */
const nativeTypes = {
  'BaseProperty': {
    'inherits': [],
    'primitive': false
  },
  'ContainerProperty': {
    'inherits': ['BaseProperty'],
    'primitive': false
  },
  'NamedProperty': {
    'inherits': ['ContainerProperty'],
    'primitive': false
  },
  'NodeProperty': {
    'inherits': ['ContainerProperty'],
    'primitive': false
  },
  'NamedNodeProperty': {
    'inherits': ['NodeProperty', 'NamedProperty'],
    'primitive': false
  },
  'RelationshipProperty': {
    'inherits': ['NodeProperty', 'NamedProperty'],
    'primitive': false
  },
  'String': {
    'inherits': ['ContainerProperty'],
    'primitive': true
  },
  'Float32': {
    'inherits': ['BaseProperty'],
    'primitive': true
  },
  'Float64': {
    'inherits': ['BaseProperty'],
    'primitive': true
  },
  'Int8': {
    'inherits': ['BaseProperty'],
    'primitive': true
  },
  'Uint8': {
    'inherits': ['BaseProperty'],
    'primitive': true
  },
  'Int16': {
    'inherits': ['BaseProperty'],
    'primitive': true
  },
  'Uint16': {
    'inherits': ['BaseProperty'],
    'primitive': true
  },
  'Int32': {
    'inherits': ['BaseProperty'],
    'primitive': true
  },
  'Uint32': {
    'inherits': ['BaseProperty'],
    'primitive': true
  },
  'Bool': {
    'inherits': ['BaseProperty'],
    'primitive': true
  },
  'Reference': {
    'inherits': ['BaseProperty'],
    'primitive': true
  },
  'Enum': {
    'inherits': ['Int32'],
    'primitive': true
  },
  'Int64': {
    'inherits': ['BaseProperty'],
    'primitive': true
  },
  'Uint64': {
    'inherits': ['BaseProperty'],
    'primitive': true
  }
};

var primitiveTypes = [];
var reservedTypes = [];

Object.keys(nativeTypes).forEach(function(key) {
  if (nativeTypes[key].primitive) {
    primitiveTypes.push(key);
  } else {
    reservedTypes.push(key);
  }
});

var requireTypeidIfNotInherits = {
  'anyOf': [
    {
      'oneOf': [
        {
          'type': 'object',
          'properties': {
            'constants': { 'typeof': 'undefined' }
          }
        },
        {
          'type': 'object',
          'prohibited': ['constants']
        }
      ]
    },
    {
      'type': 'object',
      'required': ['inherits']
    },
    {
      'type': 'object',
      'properties': {
        'constants': {
          'type': 'array',
          'items': {
            'type': 'object',
            'required': ['typeid']
          }
        }
      }
    }
  ]
};

var originalSchema = {
  'type': 'object',
  'minProperties': 1,
  'properties': {
    'typeid': {
      '$ref': '#/$defs/versioned-typeid'
    },
    'properties': {
      '$ref': '#/$defs/properties'
    },
    'constants': {
      '$ref': '#/$defs/constants'
    },
    'inherits': {
      'oneOf': [
        {
          '$ref': '#/$defs/typeid'
        },
        {
          'type': 'array',
          'items': {
            '$ref': '#/$defs/typeid'
          }
        }
      ]
    },
    'annotation': {
      '$ref': '#/$defs/annotation'
    }
  },
  'required': [
    'typeid'
  ]
};

var templateSchema = {
  '$schema': 'http://json-schema.org/schema',
  'title': 'Property set template schema',
  '$id': 'http://www.autodesk.com/schemas/ps/template-schema.json',
  '$defs': {
    'annotation': {
      'type': 'object',
      'properties': {
        'description': { 'type': 'string' },
        //'doc': { 'type': 'string', 'format': 'uri' }
      }
    },
    'primitive-typeid': {
      'enum': primitiveTypes,
      'type': 'string'
    },
    'versioned-typeid': {
      'type': 'string',
      'pattern': '^[_a-zA-Z0-9\\.]+:[_a-zA-Z0-9\\.]+-(\\d+\\.\\d+\\.\\d+|draft)$'
    },
    'typed-reference-typeid': {
      'type': 'string',
      'pattern': '^Reference<([_a-zA-Z0-9\\.]+:[_a-zA-Z0-9\\.]+(-\\d+\\.\\d+\\.\\d+)?|' +
        primitiveTypes.join('|') + '|' + reservedTypes.join('|') + ')>$'
    },
    'reserved-typeid': {
      'enum': reservedTypes,
      'type': 'string'
    },
    'context': {
      'enum': ['single', 'array', 'map', 'set']
    },
    'typeid': {
      'oneOf': [
        { '$ref': '#/$defs/primitive-typeid' },
        { '$ref': '#/$defs/versioned-typeid' },
        { '$ref': '#/$defs/typed-reference-typeid' },
        { '$ref': '#/$defs/reserved-typeid' }
      ]
    },
    'properties': {
      'type': 'array',
      'items': { '$ref': '#/$defs/property-item' }
    },
    'property-item': {
      'type': 'object',
      'properties': {
        'context': { '$ref': '#/$defs/context' },
        'typeid': { '$ref': '#/$defs/typeid' },
        'id': { 'type': 'string' },
        'value': {},
        'typedValue': {},
        'properties': { '$ref': '#/$defs/properties' },
        'annotation': { '$ref': '#/$defs/annotation' },
        'length': {
          'type': 'integer',
          'multipleOf': 1.0,
          'minimum': 0
        },
        'optional': {
          'type': 'boolean'
        }
      },
      'required': ['id'],
      'if': { 'properties': { 'typeid': { 'const': 'Enum' } } },
      'then': { 'properties': { 'properties': { 'type': 'array' } } },
      'else': {
        'anyOf': [
          {
            'properties': {
              'properties': { 'type': 'array' },
              'typeid': { 'not': { 'type': 'string' } }
            }
          },
          {
            'properties': {
              'typeid': { 'type': 'string' },
              'properties': { 'not': { 'type': 'array' } }
            }
          }
        ]
      }
    },
    'constants': {
      'type': 'array',
      'minItems': 1,
      'items': { '$ref': '#/$defs/constant-item' }
    },
    'constant-item': {
      'type': 'object',
      'properties': {
        'id': { 'type': 'string' },
        'typeid': { '$ref': '#/$defs/typeid' },
        'value': {},
        'typedValue': {},
        'context': { '$ref': '#/$defs/context' },
        'contextKeyType': { '$ref': '#/$defs/context-key-type' },
        'annotation': { '$ref': '#/$defs/annotation' }
      },
      'required': ['id']
    },
    'context-key-type': {
      'enum': ['typeid', 'string']
    }
  },
  'allOf': [
    requireTypeidIfNotInherits,
    originalSchema
  ]
};


module.exports = { templateSchema, nativeTypes };

