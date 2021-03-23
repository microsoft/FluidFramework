/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
import { PropertyFactory } from '@fluid-experimental/property-properties';

const ParentTemplate = {
  typeid: 'Test:ParentID-0.0.1',
  inherits: ['NodeProperty', 'NamedProperty'],
  properties: [
    {
      id: 'subSet',
      typeid: 'Test:ChildID-0.0.1',
      context: 'set'
    },
    {
      id: 'text',
      typeid: 'String'
    }
  ]
};

const ChildTemplate = {
  typeid: 'Test:ChildID-0.0.1',
  inherits: 'NamedProperty',
  properties: [
    {
      id: 'text',
      typeid: 'String'
    }
  ]
};

const ExternalEnum = {
  typeid: 'Test:ExternalEnumID-0.0.1',
  inherits: 'Enum',
  properties: [
    {
      id: 'm',
      value: 1
    },
    {
      id: 'cm',
      value: 100
    },
    {
      id: 'mm',
      value: 1000
    }
  ]
};

// A property set with various forms of primitive children
const PrimitiveChildrenTemplate = {
  typeid: 'Test:PrimitiveChildrenID-0.0.1',
  inherits: 'NamedProperty',
  properties: [
    {
      id: 'aString',
      typeid: 'String'
    },
    {
      id: 'aNumber',
      typeid: 'Int32'
    },
    {
      id: 'aBoolean',
      typeid: 'Bool'
    },
    {
      id: 'anEnum',
      typeid: 'Test:ExternalEnumID-0.0.1'
    },
    {
      id: 'arrayOfNumbers',
      typeid: 'Int32',
      context: 'array'
    },
    {
      id: 'arrayOfStrings',
      typeid: 'String',
      context: 'array'
    },
    {
      id: 'mapOfNumbers',
      typeid: 'Int32',
      context: 'map'
    },
    {
      id: 'mapOfStrings',
      typeid: 'String',
      context: 'map'
    },
    {
      id: 'nested',
      properties: [
        {
          id: 'aNumber',
          typeid: 'Int32'
        }
      ]
    }
  ]
};

const ArrayContainerTemplate = {
  typeid: 'Test:ArrayContainerID-0.0.1',
  inherits: 'NamedProperty',
  properties: [
    {
      id: 'subArray',
      typeid: 'Test:ChildID-0.0.1',
      context: 'array'
    },
    {
      id: 'unrepresentedSubArray',
      typeid: 'Test:UnrepresentedID-0.0.1',
      context: 'array'
    },
    {
      id: 'nested',
      properties: [
        {
          id: 'subArray',
          typeid: 'Test:ChildID-0.0.1',
          context: 'array'
        },
        {
          id: 'unrepresentedSubArray',
          typeid: 'Test:UnrepresentedID-0.0.1',
          context: 'array'
        }
      ]
    }
  ]
};

const SetContainerTemplate = {
  typeid: 'Test:SetContainerID-0.0.1',
  inherits: 'NamedProperty',
  properties: [
    {
      id: 'subSet',
      typeid: 'Test:ChildID-0.0.1',
      context: 'set'
    },
    {
      id: 'unrepresentedSubSet',
      typeid: 'Test:UnrepresentedID-0.0.1',
      context: 'set'
    },
    {
      id: 'nested',
      properties: [
        {
          id: 'subSet',
          typeid: 'Test:ChildID-0.0.1',
          context: 'set'
        },
        {
          id: 'unrepresentedSubSet',
          typeid: 'Test:UnrepresentedID-0.0.1',
          context: 'set'
        }
      ]
    }
  ]
};

const MapContainerTemplate = {
  typeid: 'Test:MapContainerID-0.0.1',
  inherits: 'NamedProperty',
  properties: [
    {
      id: 'subMap',
      typeid: 'Test:ChildID-0.0.1',
      context: 'map'
    },
    {
      id: 'unrepresentedSubMap',
      typeid: 'Test:UnrepresentedID-0.0.1',
      context: 'map'
    },
    {
      id: 'nested',
      properties: [
        {
          id: 'subMap',
          typeid: 'Test:ChildID-0.0.1',
          context: 'map'
        },
        {
          id: 'unrepresentedSubMap',
          typeid: 'Test:UnrepresentedID-0.0.1',
          context: 'map'
        }
      ]
    }
  ]
};

const NodeContainerTemplate = {
  typeid: 'Test:NodeContainer-0.0.1',
  inherits: ['NodeProperty', 'NamedProperty'],
  properties: [
    {
      id: 'nested',
      typeid: 'NodeProperty'
    },
    {
      id: 'text',
      typeid: 'String'
    }
  ]
};

const UnrepresentedTemplate = {
  typeid: 'Test:UnrepresentedID-0.0.1',
  inherits: ['NamedProperty'],
  properties: [
    {
      id: 'text',
      typeid: 'String'
    }
  ]
};

const InheritedChildTemplate = {
  typeid: 'Test:InheritedChildID-0.0.1',
  inherits: ['Test:ChildID-0.0.1'],
  properties: [
    {
      id: 'text2',
      typeid: 'String'
    }
  ]
};

const InheritedInheritedChildTemplate = {
  typeid: 'Test:InheritedInheritedChildID-0.0.1',
  inherits: ['Test:InheritedChildID-0.0.1'],
  properties: [
    {
      id: 'text3',
      typeid: 'String'
    }
  ]
};

const InheritedChildrenTemplate = {
  typeid: 'Test:InheritedChildrenID-0.0.1',
  inherits: ['Test:ChildID-0.0.1'],
  properties: [
    {
      id: 'text2',
      typeid: 'String'
    },
    {
      id: 'children',
      typeid: 'Test:InheritedChildrenID-0.0.1',
      context: 'array'
    }
  ]
};

const MultipleInheritedTemplate = {
  typeid: 'Test:MultipleInheritedID-0.0.1',
  inherits: ['Test:InheritedChildID-0.0.1', 'NodeProperty'],
  properties: [
    {
      id: 'text3',
      typeid: 'String'
    }
  ]
};

const DoubleReferenceParentTemplate = {
  typeid: 'Test:DoubleReferenceParentID-0.0.1',
  inherits: ['NodeProperty', 'NamedProperty'],
  properties: [
    {
      id: 'ref_ref',
      typeid: 'Reference'
    }
  ]
};

const ReferenceParentTemplate = {
  typeid: 'Test:ReferenceParentID-0.0.1',
  inherits: ['NodeProperty', 'NamedProperty'],
  properties: [
    {
      id: 'someData',
      typeid: 'String'
    },
    {
      id: 'single_ref',
      typeid: 'Reference'
    },
    {
      id: 'single_prim_ref',
      typeid: 'Reference<Test:PrimitiveChildrenID>'
    },
    {
      id: 'ref1',
      typeid: 'Reference'
    },
    {
      id: 'ref2',
      typeid: 'Reference'
    },
    {
      id: 'ref3',
      typeid: 'Reference'
    },
    {
      id: 'ref4',
      typeid: 'Reference'
    },
    {
      id: 'array_ref',
      typeid: 'Reference',
      context: 'array'
    },
    {
      id: 'map_ref',
      typeid: 'Reference',
      context: 'map'
    },
    {
      id: 'substruct',
      properties: [
        {
          id: 'anotherRef',
          typeid: 'Reference'
        }
      ]
    }
  ]
};

const EscapingTestTemplate = {
  typeid: 'Test:EscapingTestTemplate-0.0.1',
  inherits: ['NodeProperty', 'NamedProperty'],
  properties: [
    {
      id: 'nested.test',
      properties: [
        { id: 'child "with" quotes', typeid: 'Test:ChildID-0.0.1' }
      ]
    }
  ]
};

const AnimalSchema = {
  typeid: 'Test:Animal-1.0.0',
  properties: [
    { id: 'name', typeid: 'String' }
  ]
};

const CatSchema = {
  inherits: ['Test:Animal-1.0.0'],
  typeid: 'Test:Cat-1.0.0',
  properties: [
    { id: 'attitude', typeid: 'Float32' }
  ]
};

const DogSchema = {
  typeid: 'Test:Dog-1.0.0',
  inherits: ['Test:Animal-1.0.0'],
  properties: [
    { id: 'salivaPower', typeid: 'Float32' }
  ]
};

const ChihuahuaSchema = {
  typeid: 'Test:Chihuahua-1.0.0',
  inherits: ['Test:Dog-1.0.0'],
  properties: [
    { id: 'insanity', typeid: 'Float32' }
  ]
};

const ChinchillaSchema = {
  typeid: 'Test:Chinchilla-1.0.0',
  inherits: ['Test:Animal-1.0.0'],
  properties: [
    { id: 'furLength', typeid: 'Float32' }
  ]
};

const positionTemplate = {
  properties: [
    { id: 'x', typeid: 'Float64' },
    { id: 'y', typeid: 'Float64' }
  ],
  typeid: 'Test:position-1.0.0'
};
const point2DImplicitTemplate = {
  properties: [
    { id: 'color', typeid: 'String' },
    {
      id: 'position', properties: [
        { id: 'x', typeid: 'Float64' },
        { id: 'y', typeid: 'Float64' }
      ]
    }
  ],
  typeid: 'Test:point2d.implicit-1.0.0'
};
const point2DExplicitTemplate = {
  properties: [
    { id: 'color', typeid: 'String' },
    { id: 'position', typeid: 'Test:position-1.0.0' }
  ],
  typeid: 'Test:point2d.explicit-1.0.0'
};

const referenceContainerTemplate = {
  typeid: 'Test:reference.container-1.0.0',
  inherits: 'NamedProperty',
  properties: [
    {
      id: 'text',
      typeid: 'String'
    },
    {
      id: 'container',
      properties: [
        {
          id: 'text',
          typeid: 'String'
        },
        {
          id: 'aNumber',
          typeid: 'Int32'
        },
        {
          id: 'ref',
          typeid: 'Reference'
        }
      ]
    }
  ]
};

const ObjectTemplate = {
  properties: [
  ],
  typeid: 'autodesk.samples:Object3D-1.0.0'
};

const LightTemplate = {
  inherits: 'autodesk.samples:Object3D-1.0.0',
  properties: [
  ],
  typeid: 'autodesk.samples:Light3D-1.0.0'
};

const CameraTemplate = {
  inherits: 'autodesk.samples:Object3D-1.0.0',
  properties: [
  ],
  typeid: 'autodesk.samples:Camera3D-1.0.0'
};

const VersionedTemplate100 = {
  typeid: 'Test:Versioned-1.0.0',
  properties: [
    { id: 'name', typeid: 'String' }
  ]
};

const VersionedTemplate101 = {
  typeid: 'Test:Versioned-1.0.1',
  properties: [
    { id: 'name', typeid: 'String' }
  ]
};

const VersionedTemplate110 = {
  typeid: 'Test:Versioned-1.1.0',
  properties: [
    { id: 'name', typeid: 'String' }
  ]
};

const VersionedTemplate120 = {
  typeid: 'Test:Versioned-1.2.0',
  properties: [
    { id: 'name', typeid: 'String' }
  ]
};

const VersionedTemplate130 = {
  typeid: 'Test:Versioned-1.3.0',
  properties: [
    { id: 'name', typeid: 'String' }
  ]
};

const VersionedTemplate200 = {
  typeid: 'Test:Versioned-2.0.0',
  properties: [
    { id: 'name', typeid: 'String' }
  ]
};

const InheritTestBaseType = {
  typeid: 'Test:InheritedTestBaseType-1.0.0',
  inherits: ['RelationshipProperty'],
  properties: [
    { id: 'name', typeid: 'String' }
  ]
};

const registerTestTemplates = function () {
  if (PropertyFactory.getTemplate(ChildTemplate.typeid)) {
    return;
  }

  PropertyFactory.register(ObjectTemplate);
  PropertyFactory.register(LightTemplate);
  PropertyFactory.register(CameraTemplate);

  PropertyFactory.register(ChildTemplate);
  PropertyFactory.register(UnrepresentedTemplate);
  PropertyFactory.register(InheritedChildTemplate);
  PropertyFactory.register(InheritedInheritedChildTemplate);
  PropertyFactory.register(InheritedChildrenTemplate);
  PropertyFactory.register(MultipleInheritedTemplate);
  PropertyFactory.register(ParentTemplate);
  PropertyFactory.register(ExternalEnum);
  PropertyFactory.register(ArrayContainerTemplate);
  PropertyFactory.register(SetContainerTemplate);
  PropertyFactory.register(MapContainerTemplate);
  PropertyFactory.register(NodeContainerTemplate);
  PropertyFactory.register(PrimitiveChildrenTemplate);
  PropertyFactory.register(ReferenceParentTemplate);
  PropertyFactory.register(DoubleReferenceParentTemplate);
  PropertyFactory.register(EscapingTestTemplate);
  PropertyFactory.register(AnimalSchema);
  PropertyFactory.register(DogSchema);
  PropertyFactory.register(CatSchema);
  PropertyFactory.register(ChinchillaSchema);
  PropertyFactory.register(positionTemplate);
  PropertyFactory.register(point2DImplicitTemplate);
  PropertyFactory.register(point2DExplicitTemplate);
  PropertyFactory.register(referenceContainerTemplate);

  PropertyFactory.register(VersionedTemplate100);
  PropertyFactory.register(VersionedTemplate101);
  PropertyFactory.register(VersionedTemplate110);
  PropertyFactory.register(VersionedTemplate120);
  PropertyFactory.register(VersionedTemplate130);
  PropertyFactory.register(VersionedTemplate200);

  PropertyFactory.register(InheritTestBaseType);

  expect(PropertyFactory.validate(ParentTemplate).isValid).toEqual(true);
  expect(PropertyFactory.validate(ChildTemplate).isValid).toEqual(true);
  expect(PropertyFactory.validate(ExternalEnum).isValid).toEqual(true);
  expect(PropertyFactory.validate(ArrayContainerTemplate).isValid).toEqual(true);
  expect(PropertyFactory.validate(SetContainerTemplate).isValid).toEqual(true);
  expect(PropertyFactory.validate(MapContainerTemplate).isValid).toEqual(true);
  expect(PropertyFactory.validate(NodeContainerTemplate).isValid).toEqual(true);
  expect(PropertyFactory.validate(UnrepresentedTemplate).isValid).toEqual(true);
  expect(PropertyFactory.validate(PrimitiveChildrenTemplate).isValid).toEqual(true);
  expect(PropertyFactory.validate(InheritedChildTemplate).isValid).toEqual(true);
  expect(PropertyFactory.validate(InheritedInheritedChildTemplate).isValid).toEqual(true);
  expect(PropertyFactory.validate(InheritedChildrenTemplate).isValid).toEqual(true);
  expect(PropertyFactory.validate(MultipleInheritedTemplate).isValid).toEqual(true);
  expect(PropertyFactory.validate(ReferenceParentTemplate).isValid).toEqual(true);
  expect(PropertyFactory.validate(DoubleReferenceParentTemplate).isValid).toEqual(true);
  expect(PropertyFactory.validate(EscapingTestTemplate).isValid).toEqual(true);

  expect(PropertyFactory.validate(positionTemplate).isValid).toEqual(true);
  expect(PropertyFactory.validate(point2DImplicitTemplate).isValid).toEqual(true);
  expect(PropertyFactory.validate(point2DExplicitTemplate).isValid).toEqual(true);
  expect(PropertyFactory.validate(referenceContainerTemplate).isValid).toEqual(true);

  expect(PropertyFactory.validate(VersionedTemplate100).isValid).toEqual(true);
  expect(PropertyFactory.validate(VersionedTemplate101).isValid).toEqual(true);
  expect(PropertyFactory.validate(VersionedTemplate110).isValid).toEqual(true);
  expect(PropertyFactory.validate(VersionedTemplate120).isValid).toEqual(true);
  expect(PropertyFactory.validate(VersionedTemplate200).isValid).toEqual(true);

  expect(PropertyFactory.validate(InheritTestBaseType).isValid).toEqual(true);
};

export {
  registerTestTemplates,

  ParentTemplate,
  ChildTemplate,
  ExternalEnum,
  PrimitiveChildrenTemplate,
  ArrayContainerTemplate,
  SetContainerTemplate,
  MapContainerTemplate,
  NodeContainerTemplate,
  UnrepresentedTemplate,
  InheritedChildTemplate,
  InheritedInheritedChildTemplate,
  InheritedChildrenTemplate,
  MultipleInheritedTemplate,
  DoubleReferenceParentTemplate,
  ReferenceParentTemplate,
  EscapingTestTemplate,
  AnimalSchema,
  CatSchema,
  DogSchema,
  ChinchillaSchema,
  ChihuahuaSchema,
  positionTemplate,
  point2DImplicitTemplate,
  point2DExplicitTemplate,
  referenceContainerTemplate
};
