export const vector2DTemplate = {
  annotation: {
    name: 'TestVector2D',
    annotation: {
      description: 'A sample vector 2D schema',
    },
  },
  typeid: 'autodesk.appframework.tests:myVector2D-1.0.0',
  properties: [
    {
      id: 'x',
      typeid: 'Float32',
    },
    {
      id: 'y',
      typeid: 'Float32',
    },
  ],
};

export const vector3DTemplate = {
  annotation: {
    name: 'TestVector3D',
    annotation: {
      description: 'A sample vector 3D schema',
    },
  },
  typeid: 'autodesk.appframework.tests:myVector3D-1.0.0',
  inherits: 'autodesk.appframework.tests:myVector2D-1.0.0',
  properties: [
    {
      id: 'z',
      typeid: 'Float32',
    },
  ],
};

export const enumUnoDosTresTemplate = {
  typeid: 'autodesk.appframework.tests:myEnumUnoDosTres-1.0.0',
  inherits: 'Enum',
  properties: [
    { id: 'uno', value: 1 },
    { id: 'dos', value: 2 },
    { id: 'tres', value: 3 },
  ],
};

export const bookDataTemplate = {
  annotation: {
    name: 'TestBookList',
    annotation: {
      description: 'A sample holder for book names (or whatever)',
    },
  },
  typeid: 'autodesk.appframework.tests:myBookData-1.0.0',
  inherits: ['NamedProperty'],
  properties: [
    {
      id: 'book',
      typeid: 'String',
    },
    {
      id: 'author',
      typeid: 'String',
    },
  ],
};

export const collectionConstants = {
  typeid: 'autodesk.appframework.tests:collectionConstants-1.0.0',
  constants: [
    {
      id: 'primitiveArray',
      typeid: 'Int32',
      context: 'array',
      value: [42, 43, 44],
    },
    {
      id: 'primitiveMap',
      typeid: 'Int32',
      context: 'map',
      value: { a: 42, b: 43 },
    },
    {
      id: 'nonPrimitiveArray',
      typeid: 'autodesk.appframework.tests:myVector2D-1.0.0',
      context: 'array',
      value: [{ x: 42, y: 43 }, { x: 44, y: 45 }],
    },
    {
      id: 'nonPrimitiveMap',
      typeid: 'autodesk.appframework.tests:myVector2D-1.0.0',
      context: 'map',
      value: {
        a: { x: 42, y: 43 },
        b: { x: 44, y: 45 },
      },
    },
    {
      id: 'bookSet',
      typeid: 'autodesk.appframework.tests:myBookData-1.0.0',
      context: 'set',
      value: [
        {
          book: 'The Hobbit',
          author: 'Tolkien',
        },
        {
          book: 'Faust',
          author: 'Goethe',
        },
      ],
    },
  ],
};

export const genericTemplate = {
  annotation: {
    name: 'TestComplexProperty',
    annotation: {
      description: 'A sample template containing different datatypes.',
    },
  },
  typeid: 'autodesk.appframework.tests:myGenericTemplate-1.0.0',
  properties: [
    {
      id: 'myF32Number',
      typeid: 'Float32',
      value: 3,
    },
    {
      id: 'myVector',
      typeid: 'autodesk.appframework.tests:myVector2D-1.0.0',
      value: { x: 1, y: 2 },
    },
    {
      id: 'myEnumCases',
      properties: [
        {
          id: 'myEnum',
          typeid: 'autodesk.appframework.tests:myEnumUnoDosTres-1.0.0',
        },
        {
          id: 'myEnumArray',
          typeid: 'autodesk.appframework.tests:myEnumUnoDosTres-1.0.0',
          context: 'array',
          value: [
            1,
            'dos',
          ],
        },
        {
          id: 'refToEnum',
          typeid: 'Reference',
          value: 'myEnum',
        },
        {
          id: 'refToEnumArrayEntry',
          typeid: 'Reference',
          value: 'myEnumArray[1]',
        },
        {
          id: 'refArrayToEnum',
          typeid: 'Reference',
          context: 'array',
          value: [
            'myEnum', 'refArrayToEnum[0]',
            'myEnumArray[0]', 'refArrayToEnum[2]',
            '/myTestProperty.myEnumCases.refToEnum', 'refArrayToEnum[4]',
            '/myTestProperty.myEnumCases.refToEnumArrayEntry', 'refArrayToEnum[6]',
          ],
        },
        {
          id: 'refMapToEnum',
          typeid: 'Reference',
          context: 'map',
          value: {
            a: 'myEnum', b: 'refMapToEnum[a]',
            c: 'myEnumArray[0]', d: 'refMapToEnum[c]',
            e: '/myTestProperty.myEnumCases.refToEnum', f: 'refMapToEnum[e]',
            g: '/myTestProperty.myEnumCases.refToEnumArrayEntry', h: 'refMapToEnum[g]',
          },
        },
      ],
    },
    {
      id: 'myUint64Int64Cases',
      properties: [
        {
          id: 'myUint64',
          typeid: 'Uint64',
          value: '4294967296',
        },
        {
          id: 'myUint64Array',
          typeid: 'Uint64',
          context: 'array',
          value: [
            '4294967296', //  new Uint64(0, 1) === 1<<32
            '1024', // new Uint64(1024, 0)
          ],
        },
        {
          id: 'myInt64Map',
          typeid: 'Int64',
          context: 'map',
          value: {
            a: '4294967296', // new Int64(0, 1) === 1<<32
            b: '1024', // new Int64(1024, 0)
          },
        },
        {
          id: 'refToUint64',
          typeid: 'Reference',
          value: 'myUint64',
        },
        {
          id: 'refToUint64ArrayEntry',
          typeid: 'Reference',
          value: 'myUint64Array[0]',
        },
        {
          id: 'refToInt64MapEntry',
          typeid: 'Reference',
          value: 'myInt64Map[a]',
        },
        {
          id: 'refArrayToUint64Int64',
          typeid: 'Reference',
          context: 'array',
          value: [
            'myUint64', 'refArrayToUint64Int64[0]',
            'myUint64Array[0]', 'refArrayToUint64Int64[2]',
            'myInt64Map[a]', 'refArrayToUint64Int64[4]',
            '/myTestProperty.myUint64Int64Cases.refToUint64', 'refArrayToUint64Int64[6]',
            '/myTestProperty.myUint64Int64Cases.refToUint64ArrayEntry', 'refArrayToUint64Int64[8]',
            '/myTestProperty.myUint64Int64Cases.refToInt64MapEntry', 'refArrayToUint64Int64[10]',
          ],
        },
        {
          id: 'refMapToUint64Int64',
          typeid: 'Reference',
          context: 'map',
          value: {
            a: 'myUint64', b: 'refMapToUint64Int64[a]',
            c: 'myUint64Array[0]', d: 'refMapToUint64Int64[c]',
            e: 'myInt64Map[a]', f: 'refMapToUint64Int64[e]',
            g: '/myTestProperty.myUint64Int64Cases.refToUint64', h: 'refMapToUint64Int64[g]',
            i: '/myTestProperty.myUint64Int64Cases.refToUint64ArrayEntry', j: 'refMapToUint64Int64[i]',
            k: '/myTestProperty.myUint64Int64Cases.refToInt64MapEntry', l: 'refMapToUint64Int64[k]',
          },
        },
      ],
    },
    {
      id: 'myReference',
      typeid: 'Reference',
      context: 'single',
      value: 'myVector',
    },
    {
      id: 'myMultiHopReference',
      typeid: 'Reference',
      context: 'single',
      value: 'myReference',
    },
    {
      id: 'myI32Array',
      typeid: 'Int32',
      context: 'array',
      value: [
        0,
        10,
        20,
        30,
        40,
      ],
    },
    {
      id: 'myDynamicProperty',
      typeid: 'NodeProperty',
    },
    {
      id: 'myComplexArray',
      typeid: 'autodesk.appframework.tests:myVector2D-1.0.0',
      context: 'array',
      value: [
        {
          x: 1,
          y: 2,
        },
        {
          x: 10,
          y: 20,
        },
      ],
    },
    {
      id: 'myReferenceArray',
      typeid: 'Reference',
      context: 'array',
      value: [
        'myF32Number',
        '../myTestProperty.myF32Number',
        '/myTestProperty.myF32Number',

        'myVector',
        '../myTestProperty.myVector',
        '/myTestProperty.myVector',

        'myI32Array[0]',
        '../myTestProperty.myI32Array[0]',
        '/myTestProperty.myI32Array[0]',

        'myComplexArray[0]',
        '/myTestProperty.myComplexArray[0]',
        '../myTestProperty.myComplexArray[0]',

        'myMap[firstNumber]',
        '../myTestProperty.myMap[firstNumber]',
        '/myTestProperty.myMap[firstNumber]',

        'myComplexMap[firstEntry]',
        '../myTestProperty.myComplexMap[firstEntry]',
        '/myTestProperty.myComplexMap[firstEntry]',

        'myReferenceArray[0]',
        'myReferenceArray[1]',
        'myReferenceArray[2]',
        'myReferenceArray[3]',
        'myReferenceArray[4]',
        'myReferenceArray[5]',
        'myReferenceArray[6]',
        'myReferenceArray[7]',
        'myReferenceArray[8]',
        'myReferenceArray[9]',
        'myReferenceArray[10]',
        'myReferenceArray[11]',
        'myReferenceArray[12]',
        'myReferenceArray[13]',
        'myReferenceArray[14]',
        'myReferenceArray[15]',
        'myReferenceArray[16]',
        'myReferenceArray[17]',
      ],
    },
    {
      id: 'myMap',
      typeid: 'Int32',
      context: 'map',
      value: {
        firstNumber: 1111,
        secondNumber: 2222,
        thirdNumber: 3333,
      },
    },
    {
      id: 'myComplexMap',
      typeid: 'autodesk.appframework.tests:myVector2D-1.0.0',
      context: 'map',
      value: {
        firstEntry: {
          x: 10,
          y: 20,
        },
        secondEntry: {
          x: 30,
          y: 40,
        },
        thirdEntry: {
          x: 50,
          y: 60,
        },
      },
    },
    {
      id: 'myReferenceMap',
      typeid: 'Reference',
      context: 'map',
      value: {
        a: 'myF32Number',
        b: '../myTestProperty.myF32Number',
        c: '/myTestProperty.myF32Number',

        d: 'myVector',
        e: '../myTestProperty.myVector',
        f: '/myTestProperty.myVector',

        g: 'myI32Array[0]',
        h: '../myTestProperty.myI32Array[0]',
        i: '/myTestProperty.myI32Array[0]',

        j: 'myComplexArray[0]',
        k: '/myTestProperty.myComplexArray[0]',
        l: '../myTestProperty.myComplexArray[0]',

        m: 'myMap[firstNumber]',
        n: '../myTestProperty.myMap[firstNumber]',
        o: '/myTestProperty.myMap[firstNumber]',

        p: 'myComplexMap[firstEntry]',
        q: '../myTestProperty.myComplexMap[firstEntry]',
        r: '/myTestProperty.myComplexMap[firstEntry]',

        aa: 'myReferenceMap[a]',
        bb: 'myReferenceMap[b]',
        cc: 'myReferenceMap[c]',
        dd: 'myReferenceMap[d]',
        ee: 'myReferenceMap[e]',
        ff: 'myReferenceMap[f]',
        gg: 'myReferenceMap[g]',
        hh: 'myReferenceMap[h]',
        ii: 'myReferenceMap[i]',
        jj: 'myReferenceMap[j]',
        kk: 'myReferenceMap[k]',
        ll: 'myReferenceMap[l]',
        mm: 'myReferenceMap[m]',
        nn: 'myReferenceMap[n]',
        oo: 'myReferenceMap[o]',
        pp: 'myReferenceMap[p]',
        qq: 'myReferenceMap[q]',
        rr: 'myReferenceMap[r]',
      },
    },
    {
      id: 'myBookSet',
      typeid: 'autodesk.appframework.tests:myBookData-1.0.0',
      context: 'set',
      value: [
        {
          book: 'Principia Mathematica',
          author: 'Newton',
        },
        {
          book: 'Chamber of Secrets',
          author: 'Rowling',
        },
        {
          book: 'Brief History of Time',
          author: 'Hawking',
        },
      ],
    },
  ],
};
