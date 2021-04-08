export const point3DSchema = {
  properties: [
    {
      id: 'x',
      typeid: 'Float64',
    },
    {
      id: 'y',
      typeid: 'Float64',
    },
    {
      id: 'z',
      typeid: 'Float64',
    }],
  typeid: 'autodesk.math:point3d-1.0.0',
};

export const coordinateSystem3DSchema = {
  properties: [
    {
      id: 'axisX',
      typeid: 'autodesk.math:point3d-1.0.0',
      value: {x: 1, y: 0, z: 0},
    },
    {
      id: 'axisY',
      typeid: 'autodesk.math:point3d-1.0.0',
      value: {x: 0, y: 1, z: 0},
    },
    {
      id: 'axisZ',
      typeid: 'autodesk.math:point3d-1.0.0',
      value: {x: 0, y: 0, z: 1},
    },
  ],
  typeid: 'autodesk.math:coordinateSystem3d-1.0.0',
};

export const primitiveCollectionsSchema = {
  properties: [
    {
      context: 'array',
      id: 'array',
      typeid: 'Int32',
      value: [1, 2, 3],
    },
    {
      context: 'map',
      id: 'map',
      typeid: 'String',
      value: {a: 'Phone', b: 'Home'},
    },
  ],
  typeid: 'autodesk.collections:primitive-1.0.0',
};

export const primitiveCollectionsNodeSchema = {
  inherits: ['NodeProperty','autodesk.collections:primitive-1.0.0'],
  typeid: 'autodesk.collections:primitive.node-1.0.0'
};

export const nonPrimitiveCollectionsSchema = {
  properties: [
    {
      context: 'array',
      id: 'array',
      typeid: 'autodesk.math:point3d-1.0.0',
      value: [{x: 1, y: 0, z: 0}, {x: 0, y: 1, z: 0}, {x: 0, y: 0, z: 1}],
    },
    {
      context: 'map',
      id: 'map',
      typeid: 'autodesk.math:point3d-1.0.0',
      value: {axisX: {x: 1, y: 0, z: 0}, axisY: {x: 0, y: 1, z: 0}, axisZ: {x: 0, y: 0, z: 1}},
    },
    {
      context: 'set',
      id: 'set',
      typeid: 'NamedProperty',
      value: [{}, {}],
    },
  ],
  typeid: 'autodesk.collections:non.primitive-1.0.0',
};

export const typedReferencesSchema = {
  properties: [
    {
      id: 'StringReference',
      typeid: 'Reference<String>',
      value: '/String',
    },
    {
      id: 'StringReferenceArray',
      context: 'array',
      typeid: 'Reference<String>',
      value: ['/String'],
    },
    {
      id: 'ComplexTypeReference',
      typeid: 'Reference<autodesk.math:coordinateSystem3d-1.0.0>',
      value: '/CoordinateSystem3D',
    }
  ],
  typeid: 'autodesk.typedreferences:typed.references-1.0.0',
};

export const referenceCollectionsSchema = {
  properties: [
    {
      context: 'array',
      id: 'arrayOfReferences',
      typeid: 'Reference',
      value: [
        '../EnumCases.enum',
        '../EnumCases.enumArray',
        '../EnumCases.enumArray[0]',
        '../EnumCases.enumMap',
        '../EnumCases.enumMap[a]',
        '../InvalidReference',
        'someOtherNonExisting',
        '../NonPrimitiveCollections.array[0]',
        '../NonPrimitiveCollections.map[axisX]',
        '../CoordinateSystem3D',
        '../String',
        '../PrimitiveCollections.array[0]',
        '../PrimitiveCollections.map[a]',
        '../Uint64Cases.uint64',
        '../Uint64Cases.uint64Array[0]',
        '../Uint64Cases.uint64Map[a]',
        '../ValidReference',
        '../PrimitiveCollections.array',
        '../PrimitiveCollections.map',
        '../NonPrimitiveCollections.set',
      ],
    },
    {
      context: 'map',
      id: 'map',
      typeid: 'Reference',
      value: {
        Enum: '../EnumCases.enum',
        EnumArray: '../EnumCases.enumArray',
        EnumArrayEntry: '../EnumCases.enumArray[0]',
        EnumMap: '../EnumCases.enumMap',
        EnumMapEntry: '../EnumCases.enumMap[a]',
        InvalidMultiHopReference: '../InvalidReference',
        InvalidReference: 'someOtherNonExisting',
        NonPrimitiveArrayEntry: '../NonPrimitiveCollections.array[0]',
        NonPrimitiveMapEntry: '../NonPrimitiveCollections.map[axisX]',
        NonPrimitiveProperty: '../CoordinateSystem3D',
        Primitive: '../String',
        PrimitiveArrayEntry: '../PrimitiveCollections.array[0]',
        PrimitiveMapEntry: '../PrimitiveCollections.map[a]',
        Uint64: '../Uint64Cases.uint64',
        Uint64ArrayEntry: '../Uint64Cases.uint64Array[0]',
        Uint64MapEntry: '../Uint64Cases.uint64Map[a]',
        ValidMultiHopReference: '../ValidReference',
        array: '../PrimitiveCollections.array',
        map: '../PrimitiveCollections.map',
        set: '../NonPrimitiveCollections.set',
      },
    },
  ],
  typeid: 'autodesk.collections:reference-1.0.0',
};

export const enumUnoDosTresSchema = {
  inherits: 'Enum',
  properties: [
    {id: 'uno', value: 1},
    {id: 'dos', value: 2},
    {id: 'tres', value: 3},
  ],
  typeid: 'autodesk.enum:unoDosTres-1.0.0',
};

export const enumCasesSchema = {
  properties: [
    {
      id: 'enum',
      typeid: 'autodesk.enum:unoDosTres-1.0.0',
      value: 2,
    },
    {
      context: 'map',
      id: 'enumMap',
      typeid: 'autodesk.enum:unoDosTres-1.0.0',
      value: {
        a: 1,
        b: 2,
        c: 3,
      },
    },
    {
      context: 'array',
      id: 'enumArray',
      typeid: 'autodesk.enum:unoDosTres-1.0.0',
      value: [
        1, 2, 3,
      ],
    },
    {
      id: 'inlineEnum',
      properties: [
        {id: 'eins', value: 1},
        {id: 'zwei', value: 2},
        {id: 'drei', value: 3},
      ],
      typeid: 'Enum',
    },
    {
      context: 'array',
      id: 'enumInlineArray',
      properties: [
        {id: 'un', value: 1},
        {id: 'deux', value: 2},
        {id: 'trois', value: 3},
      ],
      typeid: 'Enum',
      value: [
        1, 2, 3,
      ],
    },
  ],
  typeid: 'autodesk.enum:enums-1.0.0',
};

export const uint64CasesSchema = {
  properties: [
    {
      id: 'uint64',
      typeid: 'Uint64',
      value: 11,
    },
    {
      context: 'map',
      id: 'uint64Map',
      typeid: 'Uint64',
      value: {
        a: 1,
        b: 2,
        c: 3,
      },
    },
    {
      context: 'array',
      id: 'uint64Array',
      typeid: 'Uint64',
      value: [
        1, 2, 3,
      ],
    },
  ],
  typeid: 'autodesk.uint64:uint64-1.0.0',
};

export const inheritNodeProp  =  {
  inherits: 'NodeProperty',
  properties: [
    { id: 'something', typeid: 'String' },
  ],
  typeid: 'test:inheritsNodeProp-1.0.0',
};

export const sampleConstSchema = {
  constants: [
    {
      id: 'const',
      typeid: 'Float64',
      value: 20.5,
    },
  ],
  properties: [
    {
      id: 'x',
      typeid: 'Float64',
    },
    {
      id: 'y',
      typeid: 'Float64',
    },
  ],
  typeid: 'autodesk.sample:constant-1.0.0',
};

export const sampleConstCollectionSchema = {
  constants: [
    {
      context: 'array',
      id: 'numbersConst',
      typeid: 'Uint32',
      value: [1, 2, 3],
    },
  ],
  typeid: 'autodesk.sample:collection.constant-1.0.0',
};

export const constantsCustomType = {
  constants: [
    { id: 'constGrandchild', typeid: 'Uint32', context: 'array' },
  ],
  properties: [
    { id: 'propGrandchild', properties: [
      { id: 'dynamic_string', typeid: 'String' },
    ]},
  ],
  typeid: 'autodesk.sample:ConstantsCustomType-1.0.0',
};

export const sampleComplexConstsSchema = {
  constants: [
    { id: 'constChild', typeid: 'autodesk.sample:ConstantsCustomType-1.0.0', value: {
      constGrandchild: [1, 2, 3],
      propGrandchild: {
        dynamic_string: 'I am a string',
      },
    }},
  ],
  properties: [
    { id: 'prop', typeid: 'Int8', value: 123 },
  ],
  typeid: 'autodesk.sample:Constants-1.0.0',
};

export const inheritsNamedNodeProp = {
  inherits: ['NamedNodeProperty'],
  typeid: 'test:inheritsNamedNodeProp-1.0.0',
};
