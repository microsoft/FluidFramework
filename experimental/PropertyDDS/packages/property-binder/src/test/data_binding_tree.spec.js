/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals should, expect */
import { DataBindingTree } from '../data_binder/dataBindingTree';
import { catchConsoleErrors } from './catchConsoleError';

describe('DataBindingTree', function() {
  catchConsoleErrors();

  beforeAll(function() {
    jest.setTimeout(20000);
  });

  it('exists', function() {
    expect(DataBindingTree).toBeDefined();
  });

  it('should insert', function() {
    var tree = new DataBindingTree();

    // Should return the node
    var node1 = tree.insert('a.b.c.d', 1);
    expect(node1).toBeDefined();
    var node2 = tree.insert('a.b.e.f', 2);
    expect(node2).toBeDefined();
    var node3 = tree.insert('a.b', 3);
    expect(node3).toBeDefined();

    // Tree should now be
    //        root
    //          | 'a.b'
    //          3
    //   'c.d' / \ 'e.f'
    //        1   2

    var node = tree.getNode('a.b.c.d');
    expect(node.getValue()).toEqual(1);
    expect(node).toEqual(node1);

    node = tree.getNode('a.b.e.f');
    expect(node.getValue()).toEqual(2);
    expect(node).toEqual(node2);

    node = tree.getNode('a.b');
    expect(node.getValue()).toEqual(3);
    expect(node).toEqual(node3);

    var node4 = tree.insert('a.b.x.y.z', 4);
    expect(node4).toBeDefined();
    // Tree should now be
    //          root
    //            | 'a.b'
    //            3
    // 'c.d' /    | 'e.f' \ 'x.y.z'
    //      1     2       4

    node = tree.getNode('a.b.x.y.z');
    expect(node.getValue()).toEqual(4);
    expect(node).toEqual(node4);

    node = tree.getNode('not.a.path');
    expect(node).toBeNull();
  });

  it('should remove', function() {
    var tree = new DataBindingTree();

    tree.insert('a.b.c.d', 1);
    tree.insert('a.b.e.f', 2);
    tree.insert('a.b', 3);
    tree.insert('a.b.e.f.x.y.z', 4);

    // Tree should now be
    //        root
    //          | 'a.b'
    //          3
    //   'c.d' / \ 'e.f'
    //        1   2
    //            | 'x.y.z'
    //            4

    // Removing a path should remove all nodes below that path and return the subtree
    var subtree = tree.remove('a.b.e.f.x');
    expect(subtree).toBeDefined();
    // Tree should now be    subtree should be
    //        root             root
    //          | 'a.b'          | 'y.z'
    //          3                4
    //   'c.d' / \ 'e.f'
    //        1   2

    expect(subtree.getNode('y.z').getValue()).toEqual(4);
    expect(tree.getNode('a.b.e.f').getValue()).toEqual(2); // Node 2 is now the closest node along that path

    subtree = tree.remove('a.b.c.d');
    expect(subtree).toBeDefined();
    // Tree should now be    subtree should be
    //        root             root - value=1
    //          | 'a.b'
    //          3
    //          | 'e.f'
    //          2

    expect(subtree.getValue()).toEqual(1);
    expect(tree.getNode('a.b.c.d')).toBeNull();
    expect(tree.getNode('a.b').getValue()).toEqual(3);
    expect(tree.getNode('a.b.e.f').getValue()).toEqual(2);
  });

  it('should insert/remove correctly with absolute paths', function() {
    var tree = new DataBindingTree();

    tree.insert('/a.b.c.d', 1);
    tree.insert('/a.b.e.f', 2);
    tree.insert('/a.b', 3);
    tree.insert('/a.b.e.f.x.y.z', 4);

    // Tree should now be
    //        root
    //          | 'a.b'
    //          3
    //   'c.d' / \ 'e.f'
    //        1   2
    //            | 'x.y.z'
    //            4

    // Removing a path should remove all nodes below that path and return the subtree
    var subtree = tree.remove('/a.b.e.f.x');
    expect(subtree).toBeDefined();
    // Tree should now be    subtree should be
    //        root             root
    //          | 'a.b'          | 'y.z'
    //          3                4
    //   'c.d' / \ 'e.f'
    //        1   2

    expect(subtree.getNode('y.z').getValue()).toEqual(4);
    expect(tree.getNode('/a.b.e.f').getValue()).toEqual(2); // Node 2 is now the closest node along that path

    subtree = tree.remove('/a.b.c.d');
    expect(subtree).toBeDefined();
    // Tree should now be    subtree should be
    //        root             root - value=1
    //          | 'a.b'
    //          3
    //          | 'e.f'
    //          2

    expect(subtree.getValue()).toEqual(1);
    expect(tree.getNode('/a.b.c.d')).toBeNull();
    expect(tree.getNode('/a.b').getValue()).toEqual(3);
    expect(tree.getNode('/a.b.e.f').getValue()).toEqual(2);
  });

  it('should support array inserts', function() {
    var tree = new DataBindingTree();

    expect(function() { tree.insert('a.b.c[]', 6); }).toThrow();
    expect(function() { tree.insert('a.b.c[0', 6); }).toThrow();
    var node0 = tree.insert('a', 0);
    expect(node0).toBeDefined();
    var node1 = tree.insert('a.b.c[0].d', 1);
    expect(node1).toBeDefined();
    var node3 = tree.insert('a.b.c[1].e', 3); // This will extend the array to have 2 elems but wouldn't shift it
    expect(node3).toBeDefined();
    var node2 = tree.insert('a.b.c[2]', 2);
    expect(node2).toBeDefined();
    var node4 = tree.getNode('a.b.c[2]').insert('h.j', 4); // To insert a value into an existing entry, use that node
    expect(node4).toBeDefined();
    var node5 = tree.insert('a.b.d', 5);
    expect(node5).toBeDefined();

    // Should throw if no index provided
    expect((function() { tree.insert('a.b.c[]', 6); })).toThrow();

    // Should throw if invalid index provided
    expect((function() { tree.insert('a.b.c[-1]', 6); })).toThrow();
    expect((function() { tree.insert('a.b.c[4]', 6); })).toThrow();
    expect((function() { tree.insert('a.b.c[4', 6); })).toThrow();

    // Tree should now be
    //            root
    //              | 'a'
    //              0
    //     'b.c' /     \ 'b.d'
    //          /       \
    //    |0 | 1 | 2|    5
    // 'd'/    |   2
    //   /  'e'|   |
    //  1      3   | 'h.j'
    //             4

    var node = tree.getNode('a');
    expect(node.getValue()).toEqual(0);
    expect(node).toEqual(node0);

    node = tree.getNode('a.b.d');
    expect(node.getValue()).toEqual(5);
    expect(node).toEqual(node5);

    expect(tree.getNode('a.b.c.d')).toBeNull(); // Missing index

    node = tree.getNode('a.b.c[0].d'); // Index included, should return the leaf node
    expect(node.getValue()).toEqual(1);
    expect(node).toEqual(node1);

    node = tree.getNode('a.b.c[0]').getNode('d');
    expect(node.getValue()).toEqual(1);
    expect(node).toEqual(node1);

    node = tree.getNode('a.b.c[1].e');
    expect(node.getValue()).toEqual(3);
    expect(node).toEqual(node3);

    node = tree.getNode('a.b.c[2]');
    expect(node.getValue()).toEqual(2);
    expect(node).toEqual(node2);
    expect(node.getNode('h.j').getValue()).toEqual(4);

    expect(tree.getNode('a.b.c[3]')).toBeNull(); // Out of bounds index
  });

  it('should support array removal', function() {
    var tree = new DataBindingTree();

    tree.insert('a', 0);
    tree.insert('a.b.c[0].d', 1);
    tree.insert('a.b.c[1].d', 2);
    tree.insert('a.b.c[2].d', 3);
    tree.insert('a.b.c[3].d', 4);
    tree.insert('a.b.c[4].d', 5);

    // Tree should now be
    //            root
    //              | 'a'
    //              0
    //              | 'b.c'
    //              |
    //        |0 |  1  |  2  |  3  | 4|
    //      'd'| 'd'|  'd'|  'd'| 'd'|
    //         |    |     |     |    |
    //         1    2     3     4    5

    // Confirm array structure
    expect(tree.getNode('a.b.c[0].d').getValue()).toEqual(1);
    expect(tree.getNode('a.b.c[1].d').getValue()).toEqual(2);
    expect(tree.getNode('a.b.c[2].d').getValue()).toEqual(3);
    expect(tree.getNode('a.b.c[3].d').getValue()).toEqual(4);
    expect(tree.getNode('a.b.c[4].d').getValue()).toEqual(5);

    // Should remove from end
    var subtree = tree.remove('a.b.c[4]');
    expect(subtree.getNode('d').getValue()).toEqual(5);
    expect(tree.getNode('a.b.c[4].d')).toBeNull(); // Index 4 should no longer exist
    expect(tree.getNode('a.b.c[3].d').getValue()).toEqual(4); // Should be unaffected

    // Should remove from the beginning
    subtree = tree.remove('a.b.c[0]');
    expect(subtree.getNode('d').getValue()).toEqual(1);
    expect(tree.getNode('a.b.c[3]')).toBeNull(); // Index 3 should not exist anymore
    // Everything should be shifted left by 1
    expect(tree.getNode('a.b.c[0].d').getValue()).toEqual(2);
    expect(tree.getNode('a.b.c[1].d').getValue()).toEqual(3);
    expect(tree.getNode('a.b.c[2].d').getValue()).toEqual(4);

    // Tree should now be
    //            root
    //              | 'a'
    //              0
    //              | 'b.c'
    //              |
    //        |0 |  1  | 2|
    //      'd'| 'd'| 'd'|
    //         |    |    |
    //         2    3    4

    // Should remove from the middle
    subtree = tree.remove('a.b.c[1]');
    expect(subtree.getNode('d').getValue()).toEqual(3);
    expect(tree.getNode('a.b.c[2]')).toBeNull(); // Index 2 should not exist anymore
    expect(tree.getNode('a.b.c[0].d').getValue()).toEqual(2);
    expect(tree.getNode('a.b.c[1].d').getValue()).toEqual(4);

    // Should not remove unknown index
    expect(tree.remove('a.b.c[2]')).toBeNull();
    expect((function() { tree.remove('a.b.c[2'); })).toThrow(); // Invalid path should throw
    // Tree should not have changed
    expect(tree.getNode('a.b.c[0].d').getValue()).toEqual(2);
    expect(tree.getNode('a.b.c[1].d').getValue()).toEqual(4);

    // Should remove sub-property
    subtree = tree.remove('a.b.c[0].d');
    expect(subtree.getValue()).toEqual(2);
    expect(tree.getNode('a.b.c[0]')).toBeDefined();
  });
  it('should support nested arrays', function() {
    var tree = new DataBindingTree();

    tree.insert('Widget5.aa[0].bb[0].cc[0]', 1);
    tree.insert('Widget5.aa[0].bb[0].cc[1]', 2);
    tree.insert('Widget5.aa[0].bb[0]', 3);

    expect(tree.getNode('Widget5.aa[0].bb[1].cc[0]').getValue()).toEqual(1);
    expect(tree.getNode('Widget5.aa[0].bb[1].cc[1]').getValue()).toEqual(2);
    expect(tree.getNode('Widget5.aa[0].bb[0]').getValue()).toEqual(3);

    tree.insert('Widget5.aa[0]', 4);
    // this last insert should push everything to be under aa[1]
    expect(tree.getNode('Widget5.aa[1].bb[1].cc[0]').getValue()).toEqual(1);
    expect(tree.getNode('Widget5.aa[1].bb[1].cc[1]').getValue()).toEqual(2);
    expect(tree.getNode('Widget5.aa[1].bb[0]').getValue()).toEqual(3);
    expect(tree.getNode('Widget5.aa[0]').getValue()).toEqual(4);

  });
  it('should support (nested) arrays with multiple children', function() {
    var tree = new DataBindingTree();

    tree.insert('Widget5.aa[0].bb[0].cc[0].a', 1);
    tree.insert('Widget5.aa[0].bb[0].cc[0].b', 2);
    tree.insert('Widget5.ccc[0].a', 3);
    tree.insert('Widget5.ccc[0].b', 4);
    tree.insert('Widget5.ccc[0].c', 5);

    expect(tree.getNode('Widget5.aa[0].bb[0].cc[0].a').getValue()).toEqual(1);
    expect(tree.getNode('Widget5.aa[0].bb[0].cc[0].b').getValue()).toEqual(2);
    expect(tree.getNode('Widget5.ccc[0].a').getValue()).toEqual(3);
    expect(tree.getNode('Widget5.ccc[0].b').getValue()).toEqual(4);
    expect(tree.getNode('Widget5.ccc[0].c').getValue()).toEqual(5);

  });
  it('should support nested maps', function() {
    var tree = new DataBindingTree();

    tree.insert('Widget5.aa[a0].bb[a0].cc[a0]', 1);
    tree.insert('Widget5.aa[a0].bb[a0].cc[a1]', 2);
    tree.insert('Widget5.aa[a0].bb[a0]', 3);

    expect(tree.getNode('Widget5.aa[a0].bb[a0].cc[a0]').getValue()).toEqual(1);
    expect(tree.getNode('Widget5.aa[a0].bb[a0].cc[a1]').getValue()).toEqual(2);
    expect(tree.getNode('Widget5.aa[a0].bb[a0]').getValue()).toEqual(3);

    tree.insert('Widget5.aa[a0]', 4);
    // this last insert should _not_ push anything, so all should still be under aa[a0]
    expect(tree.getNode('Widget5.aa[a0].bb[a0].cc[a0]').getValue()).toEqual(1);
    expect(tree.getNode('Widget5.aa[a0].bb[a0].cc[a1]').getValue()).toEqual(2);
    expect(tree.getNode('Widget5.aa[a0].bb[a0]').getValue()).toEqual(3);
    expect(tree.getNode('Widget5.aa[a0]').getValue()).toEqual(4);

  });
  it('should support (nested) maps with multiple children', function() {
    var tree = new DataBindingTree();

    tree.insert('Widget5.aa[a0].bb[a0].cc[a0].a', 1);
    tree.insert('Widget5.aa[a0].bb[a0].cc[a0].b', 2);
    tree.insert('Widget5.aaa[a0].c', 3);
    tree.insert('Widget5.aaa[a0].d', 4);
    tree.insert('Widget5.aaa[a0].e', 5);

    expect(tree.getNode('Widget5.aa[a0].bb[a0].cc[a0].a').getValue()).toEqual(1);
    expect(tree.getNode('Widget5.aa[a0].bb[a0].cc[a0].b').getValue()).toEqual(2);
    expect(tree.getNode('Widget5.aaa[a0].c').getValue()).toEqual(3);
    expect(tree.getNode('Widget5.aaa[a0].d').getValue()).toEqual(4);
    expect(tree.getNode('Widget5.aaa[a0].e').getValue()).toEqual(5);

    tree.insert('Widget5.aaa[a0]', 6);
    // this last insert should _not_ push anything, so all should still be under aaa[a0]
    expect(tree.getNode('Widget5.aaa[a0].c').getValue()).toEqual(3);
    expect(tree.getNode('Widget5.aaa[a0].d').getValue()).toEqual(4);
    expect(tree.getNode('Widget5.aaa[a0].e').getValue()).toEqual(5);
    expect(tree.getNode('Widget5.aaa[a0]').getValue()).toEqual(6);

  });
  it('should support deeply nested arrays ', function() {
    var tree = new DataBindingTree();

    tree.insert('Widget5.children[0]', 1);
    tree.insert('Widget5.children[0].children[0]', 1);
    tree.insert('Widget5.children[0].children[0].children[0]', 1);
    tree.insert('Widget5.children[0].children[0].children[1]', 1);
    tree.insert('Widget5.children[1]', 1);
    tree.insert('Widget5.children[1].children[0]', 1);
    tree.insert('Widget5.children[1].children[0].children[0]', 1);
    tree.insert('Widget5.children[1].children[1]', 1);
    tree.insert('Widget5.children[1].children[1].children[0]', 1);
    tree.insert('Widget5.children[1].children[2]', 1);
    tree.insert('Widget5.children[1].children[2].children[0]', 1);
    tree.insert('Widget5.children[1].children[2].children[1]', 1);
    tree.insert('Widget5.children[1].children[3]', 1);
    tree.insert('Widget5.children[1].children[3].children[0]', 1);
    tree.insert('Widget5.children[1].children[3].children[0].children[0]', 1);
    tree.insert('Widget5.children[1].children[3].children[0].children[1]', 1);
    tree.insert('Widget5.children[1].children[3].children[0].children[2]', 1);
    tree.insert('Widget5.children[1].children[3].children[1]', 1);
    tree.insert('Widget5.children[1].children[3].children[2]', 1);
    tree.insert('Widget5.children[1].children[3].children[1].children[0]', 1);
    tree.insert('Widget5.children[1].children[3].children[1].children[1]', 1);
    tree.insert('Widget5.children[1].children[3].children[1].children[1].children[0]', 5);
    tree.insert('Widget5.children[1].children[3].children[2].children[0]', 1);
    tree.insert('Widget5.children[1].children[3].children[2].children[1]', 1);
    tree.insert('Widget5.children[1].children[3].children[2].children[1].children[0]', 1);
    //      tree.insert('Widget5', 1);

    expect(tree.getNode('Widget5.children[1].children[3].children[1].children[1].children[0]').getValue()).toEqual(5);

  });

  it('should support map/set inserts', function() {
    var tree = new DataBindingTree();

    var node0 = tree.insert('a', 0);
    expect(node0).toBeDefined();
    var node1 = tree.insert('a.b.c[ab]', 1);
    expect(node1).toBeDefined();
    var node2 = tree.insert('a.b.c[ab].d', 2);
    expect(node2).toBeDefined();
    var node3 = tree.insert('a.b.c[1].e', 3);
    expect(node3).toBeDefined();
    var node4 = tree.insert('a.b.c[cd].h.j', 4);
    expect(node4).toBeDefined();
    var node5 = tree.insert('a.b.c["a[weird]index"].k', 5);
    expect(node5).toBeDefined();

    // Should throw if no index provided
    expect((function() { tree.insert('a.b.c[]', 6); })).toThrow();

    // Should throw if invalid index provided
    expect((function() { tree.insert('a.b.c[missingBracket', 6); })).toThrow();

    // Tree should now be
    //            root
    //              | 'a'
    //              0
    //        'b.c' |
    //              |
    //     {'ab' , '1' , 'cd'}
    //       1      |      |
    //   'd'/    'e'|      | 'h.j'
    //    2         3      4

    var node = tree.getNode('a');
    expect(node).toEqual(node0);

    node = tree.getNode('a.b.c[ab]');
    expect(node).toEqual(node1);

    node = tree.getNode('a.b.c[ab].d');
    expect(node).toEqual(node2);

    node = tree.getNode('a.b.c[1].e');
    expect(node).toEqual(node3);

    node = tree.getNode('a.b.c[cd].h.j');
    expect(node).toEqual(node4);

    node = tree.getNode('a.b.c["a[weird]index"].k');
    expect(node).toEqual(node5);

    expect(tree.getNode('a.b.c[notInTheCollection]')).toBeNull(); // Not in the collection
  });

  it('should support map/set removal', function() {
    var tree = new DataBindingTree();

    tree.insert('a', 0);
    tree.insert('a.b.c[de].d', 1);
    tree.insert('a.b.c[fg].d', 2);

    // Tree should now be
    //            root
    //              | 'a'
    //              0
    //              | 'b.c'
    //              |
    //        {'de', 'fg'}
    //       'd'|   'd'|
    //          1      2

    // Confirm array structure
    expect(tree.getNode('a.b.c[de].d').getValue()).toEqual(1);
    expect(tree.getNode('a.b.c[fg].d').getValue()).toEqual(2);

    // Should not remove unknown paths
    expect(tree.remove('a.b.c[xy]')).toBeNull();
    expect((function() { tree.remove('a.b.c[xy'); })).toThrow(); // Invalid path should throw

    // Should remove sub-property
    var subtree = tree.remove('a.b.c[fg].d');
    expect(subtree.getValue()).toEqual(2);
    expect(tree.getNode('a.b.c[fg]')).toBeDefined();

    // Should remove
    subtree = tree.remove('a.b.c[fg]');
    expect(subtree).toBeDefined();
    expect(tree.getNode('a.b.c[fg]')).toBeNull();
    expect(tree.getNode('a.b.c[de]')).toBeDefined();

    subtree = tree.remove('a.b.c[de]');
    expect(subtree).toBeDefined();
    expect(subtree.getNode('d').getValue()).toEqual(1);
    expect(tree.getNode('a.b.c[de]')).toBeNull();
  });

  it('should get closest node', function() {
    var tree = new DataBindingTree();

    tree.insert('a', 0);
    tree.insert('a.b.c[0].d', 1);
    tree.insert('a.b.c[1].e', 3); // This will extend the array to have two elements but would not shift it
    tree.insert('a.b.c[2]', 2);
    tree.getNode('a.b.c[2]').insert('h.j', 4); // To insert some value into an existing entry, use that node
    tree.insert('a.b.d[abc].k', 5);
    tree.insert('a.b.d[def]', 6);
    tree.insert('a.b.d[def].l', 7);

    // Tree should now be
    //            root
    //              | 'a'
    //              0
    //     'b.c' /     \ 'b.d'
    //          /        ----------
    //    |0 | 1 | 2|               \
    // 'd'/    |   2          {'abc', 'def'}
    //   /  'e'|   |        'k' |       6
    //  1      3   | 'h.j'      5       | 'l'
    //             4                    7

    // Closest node for a completely unknown path should be the root
    var closest = tree.getClosestNode('not.a.path');
    expect(closest.path).toEqual('');
    expect(closest.node).toEqual(tree);

    // Paths to test
    var exactPaths = [
      'a',
      'a.b.c[2]',
      'a.b.c[2].h.j',
      'a.b.d[abc].k',
      'a.b.d[def]',
      'a.b.d[def].l'
    ];

    for (var i = 0; i < exactPaths.length; i++) {
      // Closest node for an exact path to a node should be that node
      var path = exactPaths[i];
      closest = tree.getClosestNode(path);
      expect(closest.path).toEqual(path);
      expect(closest.node).toEqual(tree.getNode(path));

      // Closest node should be the most recent node in a path
      var notAPath = path + '.not.a.path';
      closest = tree.getClosestNode(notAPath);
      expect(closest.path).toEqual(path);
      expect(closest.node).toEqual(tree.getNode(path));
    }

    // Special cases
    closest = tree.getClosestNode('a.b.c[100]');
    expect(closest.path).toEqual('a.b');
    expect(closest.node).toEqual(tree.getNode('a.b'));

    closest = tree.getClosestNode('a.b.d[notAKey]');
    expect(closest.path).toEqual('a.b.d');
    expect(closest.node).toEqual(tree.getNode('a.b.d'));
  });

  it('should get closest node with absolute paths', function() {
    var tree = new DataBindingTree();

    tree.insert('a', 0);
    tree.insert('a.b.c[0].d', 1);
    tree.insert('a.b.c[1].e', 3); // This will extend the array to have two elements but would not shift it
    tree.insert('a.b.c[2]', 2);
    tree.getNode('a.b.c[2]').insert('h.j', 4); // To insert some value into an existing entry, use that node
    tree.insert('a.b.d[abc].k', 5);
    tree.insert('a.b.d[def]', 6);
    tree.insert('a.b.d[def].l', 7);

    // Tree should now be
    //            root
    //              | 'a'
    //              0
    //     'b.c' /     \ 'b.d'
    //          /        ----------
    //    |0 | 1 | 2|               \
    // 'd'/    |   2          {'abc', 'def'}
    //   /  'e'|   |        'k' |       6
    //  1      3   | 'h.j'      5       | 'l'
    //             4                    7

    // Closest node for a completely unknown path should be the root
    var closest = tree.getClosestNode('not.a.path');
    expect(closest.path).toEqual('');
    expect(closest.node).toEqual(tree);

    // Paths to test
    var exactPaths = [
      '/a',
      '/a.b.c[2]',
      '/a.b.c[2].h.j',
      '/a.b.d[abc].k',
      '/a.b.d[def]',
      '/a.b.d[def].l'
    ];

    for (var i = 0; i < exactPaths.length; i++) {
      // Closest node for an exact path to a node should be that node
      var path = exactPaths[i];
      closest = tree.getClosestNode(path);
      expect(closest.path).toEqual(path.substr(1)); // we never get back the leading '/'
      expect(closest.node).toEqual(tree.getNode(path));

      // Closest node should be the most recent node in a path
      var notAPath = path + '.not.a.path';
      closest = tree.getClosestNode(notAPath);
      expect(closest.path).toEqual(path.substr(1)); // we never get back the leading '/'
      expect(closest.node).toEqual(tree.getNode(path));
    }

    // Special cases
    closest = tree.getClosestNode('/a.b.c[100]');
    expect(closest.path).toEqual('a.b');
    expect(closest.node).toEqual(tree.getNode('a.b'));

    closest = tree.getClosestNode('/a.b.d[notAKey]');
    expect(closest.path).toEqual('a.b.d');
    expect(closest.node).toEqual(tree.getNode('a.b.d'));
  });

  it('should traverse tree', function() {
    var tree = new DataBindingTree();

    tree.insert('a', 1);
    tree.insert('a.b.c[0].d', 2);
    tree.insert('a.b.c[1].e', 4);
    tree.insert('a.b.c[2]', 3);
    tree.getNode('a.b.c[2]').insert('h.j', 5);
    tree.insert('a.b.d[abc].k', 6);
    tree.insert('a.b.d[def]', 7);
    tree.insert('a.b.d[def].l', 8);

    // Tree should now be
    //            root
    //              | 'a'
    //              1
    //     'b.c' /     \ 'b.d'
    //          /        ----------
    //    |0 | 1 | 2|               \
    // 'd'/    |   3          {'abc', 'def'}
    //   /  'e'|   |        'k' |       7
    //  2      4   | 'h.j'      6       | 'l'
    //             5                    8

    var sum = 0;
    tree.forEachChild(function(value) {
      sum += value;
    });

    // If forEachChild manages to traverse all nodes, sum should equal the sum of the numbers 1 to 8, i.e. 36
    expect(sum).toEqual(36);
  });

  it('should return child nodes', function() {
    var tree = new DataBindingTree();

    tree.insert('a', 1);
    tree.insert('b[0]', 2);
    tree.getNode('b[0]').insert('z', -1);
    tree.insert('c[a]', 3);
    tree.insert('c[a].z', -1);
    tree.insert('d', 4);

    // Tree should now be
    //            root
    //          / |  | \
    //     'a' /  |  |  \ 'd'
    //        1   |  |   4
    //           /    \
    //      'b' |      | 'c'
    //        |0|    {'a'}
    //         2       3
    //     'z' |       | 'z'
    //        -1      -1

    var children = tree.getChildren();
    var subtreePaths = tree.getSubtreePaths();
    var paths = Object.keys(children);
    expect(paths.length).toEqual(4); // Only returns children one level down. I.e. Nodes labeled 'z' won't be returned
    expect(subtreePaths.size).toEqual(8); // this includes all children recursively

    expect(tree.getNode('a')).toEqual(children['a']);
    expect(tree.getNode('b[0]')).toEqual(children['b'].getChild(0));
    expect(tree.getNode('c[a]')).toEqual(children['c'].getChild('a'));
    expect(tree.getNode('d')).toEqual(children['d']);

    expect(subtreePaths.has('a')).toEqual(true);
    expect(subtreePaths.has('b[0]')).toEqual(true);
    expect(subtreePaths.has('c.a')).toEqual(true);
    expect(subtreePaths.has('b[0].z')).toEqual(true);
    expect(subtreePaths.has('c.a.z')).toEqual(true);
    expect(subtreePaths.has('d')).toEqual(true);
  });

  it('should return all subtree paths', function() {
    var tree = new DataBindingTree();

    tree.insert('a', 1);
    tree.insert('b[0]', 2);
    tree.getNode('b[0]').insert('z', 3);
    tree.insert('c[a]', 4);
    tree.insert('c[a].z', 5);
    tree.insert('d', 6);
    tree.insert('a.x', 7);
    tree.insert('a.x.z', 8);
    tree.insert('a.y', 9);
    tree.insert('a.z', 10);
    tree.insert('a.xxx', 11);
    tree.insert('b[1]', 12);
    tree.insert('b[2]', 13);
    tree.insert('b[2].k', 14);
    tree.insert('b[2].k.f[0]', 15);
    tree.insert('b[2].f[0]', 16);
    tree.insert('b[2].f[0].yikes', 17);
    tree.insert('b[2].k.f[0].foobar', 18);
    tree.insert('c[b]', 19);
    tree.insert('c[b].t[k]', 20);
    tree.insert('c[b].t[w]', 21);
    tree.insert('c[b].t[w].a', 22);

    var subtreePaths = tree.getSubtreePaths();
    expect(subtreePaths.size).toEqual(27); // this includes all children recursively
    expect(subtreePaths.has('a')).toEqual(true);
    expect(subtreePaths.has('a.x')).toEqual(true);
    expect(subtreePaths.has('a.x.z')).toEqual(true);
    expect(subtreePaths.has('a.y')).toEqual(true);
    expect(subtreePaths.has('a.z')).toEqual(true);
    expect(subtreePaths.has('a.xxx')).toEqual(true);

    expect(subtreePaths.has('b')).toEqual(true);
    expect(subtreePaths.has('b[0]')).toEqual(true);
    expect(subtreePaths.has('b[0].z')).toEqual(true);

    expect(subtreePaths.has('b[1]')).toEqual(true);
    expect(subtreePaths.has('b[2]')).toEqual(true);
    expect(subtreePaths.has('b[2].k')).toEqual(true);
    expect(subtreePaths.has('b[2].k.f')).toEqual(true);
    expect(subtreePaths.has('b[2].k.f[0]')).toEqual(true);
    expect(subtreePaths.has('b[2].k.f[0].foobar')).toEqual(true);

    expect(subtreePaths.has('b[2].f')).toEqual(true);
    expect(subtreePaths.has('b[2].f[0]')).toEqual(true);
    expect(subtreePaths.has('b[2].f[0].yikes')).toEqual(true);

    expect(subtreePaths.has('c')).toEqual(true);
    expect(subtreePaths.has('c.a')).toEqual(true);
    expect(subtreePaths.has('c.a.z')).toEqual(true);
    expect(subtreePaths.has('c.b')).toEqual(true);
    expect(subtreePaths.has('c.b.t')).toEqual(true);
    expect(subtreePaths.has('c.b.t.k')).toEqual(true);
    expect(subtreePaths.has('c.b.t.w')).toEqual(true);
    expect(subtreePaths.has('c.b.t.w.a')).toEqual(true);

    expect(subtreePaths.has('d')).toEqual(true);

  });

  it('should return whether it has children correctly', function() {
    var tree = new DataBindingTree();
    expect(tree.hasChildren()).toEqual(false);
    tree.insert('a', 1);
    expect(tree.hasChildren()).toEqual(true);
    tree.insert('b[0]', 2);
    expect(tree.getNode('b[0]').hasChildren()).toEqual(false);
    tree.getNode('b[0]').insert('z', -1);
    expect(tree.getNode('b[0]').hasChildren()).toEqual(true);
    tree.insert('c[a]', 3);
    expect(tree.getNode('c[a]').hasChildren()).toEqual(false);
    tree.insert('c[a].z', -1);
    expect(tree.getNode('c[a]').hasChildren()).toEqual(true);
    tree.insert('d', 4);
    expect(tree.getNode('d').hasChildren()).toEqual(false);
  });

});
