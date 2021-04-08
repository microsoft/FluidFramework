/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* globals should, expect */
import { DataBindingTree } from '../../src/data_binder/data_binding_tree';
import { catchConsoleErrors } from './catch_console_errors';

(function() {
  describe('DataBindingTree', function() {
    catchConsoleErrors();

    before(function() {
      this.timeout(20000);
    });

    it('exists', function() {
      should.exist(DataBindingTree);
    });

    it('should insert', function() {
      var tree = new DataBindingTree();

      // Should return the node
      var node1 = tree.insert('a.b.c.d', 1);
      should.exist(node1);
      var node2 = tree.insert('a.b.e.f', 2);
      should.exist(node2);
      var node3 = tree.insert('a.b', 3);
      should.exist(node3);

      // Tree should now be
      //        root
      //          | 'a.b'
      //          3
      //   'c.d' / \ 'e.f'
      //        1   2

      var node = tree.getNode('a.b.c.d');
      node.getValue().should.equal(1);
      node.should.equal(node1);

      node = tree.getNode('a.b.e.f');
      node.getValue().should.equal(2);
      node.should.equal(node2);

      node = tree.getNode('a.b');
      node.getValue().should.equal(3);
      node.should.equal(node3);

      var node4 = tree.insert('a.b.x.y.z', 4);
      should.exist(node4);
      // Tree should now be
      //          root
      //            | 'a.b'
      //            3
      // 'c.d' /    | 'e.f' \ 'x.y.z'
      //      1     2       4

      node = tree.getNode('a.b.x.y.z');
      node.getValue().should.equal(4);
      node.should.equal(node4);

      node = tree.getNode('not.a.path');
      should.not.exist(node);
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
      should.exist(subtree);
      // Tree should now be    subtree should be
      //        root             root
      //          | 'a.b'          | 'y.z'
      //          3                4
      //   'c.d' / \ 'e.f'
      //        1   2

      subtree.getNode('y.z').getValue().should.equal(4);
      tree.getNode('a.b.e.f').getValue().should.equal(2); // Node 2 is now the closest node along that path

      subtree = tree.remove('a.b.c.d');
      should.exist(subtree);
      // Tree should now be    subtree should be
      //        root             root - value=1
      //          | 'a.b'
      //          3
      //          | 'e.f'
      //          2

      subtree.getValue().should.equal(1);
      should.not.exist(tree.getNode('a.b.c.d'));
      tree.getNode('a.b').getValue().should.equal(3);
      tree.getNode('a.b.e.f').getValue().should.equal(2);
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
      should.exist(subtree);
      // Tree should now be    subtree should be
      //        root             root
      //          | 'a.b'          | 'y.z'
      //          3                4
      //   'c.d' / \ 'e.f'
      //        1   2

      subtree.getNode('y.z').getValue().should.equal(4);
      tree.getNode('/a.b.e.f').getValue().should.equal(2); // Node 2 is now the closest node along that path

      subtree = tree.remove('/a.b.c.d');
      should.exist(subtree);
      // Tree should now be    subtree should be
      //        root             root - value=1
      //          | 'a.b'
      //          3
      //          | 'e.f'
      //          2

      subtree.getValue().should.equal(1);
      should.not.exist(tree.getNode('/a.b.c.d'));
      tree.getNode('/a.b').getValue().should.equal(3);
      tree.getNode('/a.b.e.f').getValue().should.equal(2);
    });

    it('should support array inserts', function() {
      var tree = new DataBindingTree();

      (function() { tree.insert('a.b.c[]', 6); }).should.throw(Error);
      (function() { tree.insert('a.b.c[0', 6); }).should.throw(Error);

      var node0 = tree.insert('a', 0);
      should.exist(node0);
      var node1 = tree.insert('a.b.c[0].d', 1);
      should.exist(node1);
      var node3 = tree.insert('a.b.c[1].e', 3); // This will extend the array to have 2 elems but wouldn't shift it
      should.exist(node3);
      var node2 = tree.insert('a.b.c[2]', 2);
      should.exist(node2);
      var node4 = tree.getNode('a.b.c[2]').insert('h.j', 4); // To insert a value into an existing entry, use that node
      should.exist(node4);
      var node5 = tree.insert('a.b.d', 5);
      should.exist(node5);

      // Should throw if no index provided
      (function() { tree.insert('a.b.c[]', 6); }).should.throw(Error);

      // Should throw if invalid index provided
      (function() { tree.insert('a.b.c[-1]', 6); }).should.throw(Error);
      (function() { tree.insert('a.b.c[4]', 6); }).should.throw(Error);
      (function() { tree.insert('a.b.c[4', 6); }).should.throw(Error);

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
      node.getValue().should.equal(0);
      node.should.equal(node0);

      node = tree.getNode('a.b.d');
      node.getValue().should.equal(5);
      node.should.equal(node5);

      should.not.exist(tree.getNode('a.b.c.d')); // Missing index

      node = tree.getNode('a.b.c[0].d'); // Index included, should return the leaf node
      node.getValue().should.equal(1);
      node.should.equal(node1);

      node = tree.getNode('a.b.c[0]').getNode('d');
      node.getValue().should.equal(1);
      node.should.equal(node1);

      node = tree.getNode('a.b.c[1].e');
      node.getValue().should.equal(3);
      node.should.equal(node3);

      node = tree.getNode('a.b.c[2]');
      node.getValue().should.equal(2);
      node.should.equal(node2);
      node.getNode('h.j').getValue().should.equal(4);

      should.not.exist(tree.getNode('a.b.c[3]')); // Out of bounds index
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
      tree.getNode('a.b.c[0].d').getValue().should.equal(1);
      tree.getNode('a.b.c[1].d').getValue().should.equal(2);
      tree.getNode('a.b.c[2].d').getValue().should.equal(3);
      tree.getNode('a.b.c[3].d').getValue().should.equal(4);
      tree.getNode('a.b.c[4].d').getValue().should.equal(5);

      // Should remove from end
      var subtree = tree.remove('a.b.c[4]');
      subtree.getNode('d').getValue().should.equal(5);
      should.not.exist(tree.getNode('a.b.c[4].d')); // Index 4 should no longer exist
      tree.getNode('a.b.c[3].d').getValue().should.equal(4); // Should be unaffected

      // Should remove from the beginning
      subtree = tree.remove('a.b.c[0]');
      subtree.getNode('d').getValue().should.equal(1);
      should.not.exist(tree.getNode('a.b.c[3]')); // Index 3 should not exist anymore
      // Everything should be shifted left by 1
      tree.getNode('a.b.c[0].d').getValue().should.equal(2);
      tree.getNode('a.b.c[1].d').getValue().should.equal(3);
      tree.getNode('a.b.c[2].d').getValue().should.equal(4);

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
      subtree.getNode('d').getValue().should.equal(3);
      should.not.exist(tree.getNode('a.b.c[2]')); // Index 2 should not exist anymore
      tree.getNode('a.b.c[0].d').getValue().should.equal(2);
      tree.getNode('a.b.c[1].d').getValue().should.equal(4);

      // Should not remove unknown index
      should.not.exist(tree.remove('a.b.c[2]'));
      (function() { tree.remove('a.b.c[2'); }).should.throw(Error); // Invalid path should throw
      // Tree should not have changed
      tree.getNode('a.b.c[0].d').getValue().should.equal(2);
      tree.getNode('a.b.c[1].d').getValue().should.equal(4);

      // Should remove sub-property
      subtree = tree.remove('a.b.c[0].d');
      subtree.getValue().should.equal(2);
      should.exist(tree.getNode('a.b.c[0]'));
    });
    it('should support nested arrays', function() {
      var tree = new DataBindingTree();

      tree.insert('Widget5.aa[0].bb[0].cc[0]', 1);
      tree.insert('Widget5.aa[0].bb[0].cc[1]', 2);
      tree.insert('Widget5.aa[0].bb[0]', 3);

      tree.getNode('Widget5.aa[0].bb[1].cc[0]').getValue().should.equal(1);
      tree.getNode('Widget5.aa[0].bb[1].cc[1]').getValue().should.equal(2);
      tree.getNode('Widget5.aa[0].bb[0]').getValue().should.equal(3);

      tree.insert('Widget5.aa[0]', 4);
      // this last insert should push everything to be under aa[1]
      tree.getNode('Widget5.aa[1].bb[1].cc[0]').getValue().should.equal(1);
      tree.getNode('Widget5.aa[1].bb[1].cc[1]').getValue().should.equal(2);
      tree.getNode('Widget5.aa[1].bb[0]').getValue().should.equal(3);
      tree.getNode('Widget5.aa[0]').getValue().should.equal(4);

    });
    it('should support (nested) arrays with multiple children', function() {
      var tree = new DataBindingTree();

      tree.insert('Widget5.aa[0].bb[0].cc[0].a', 1);
      tree.insert('Widget5.aa[0].bb[0].cc[0].b', 2);
      tree.insert('Widget5.ccc[0].a', 3);
      tree.insert('Widget5.ccc[0].b', 4);
      tree.insert('Widget5.ccc[0].c', 5);

      tree.getNode('Widget5.aa[0].bb[0].cc[0].a').getValue().should.equal(1);
      tree.getNode('Widget5.aa[0].bb[0].cc[0].b').getValue().should.equal(2);
      tree.getNode('Widget5.ccc[0].a').getValue().should.equal(3);
      tree.getNode('Widget5.ccc[0].b').getValue().should.equal(4);
      tree.getNode('Widget5.ccc[0].c').getValue().should.equal(5);

    });
    it('should support nested maps', function() {
      var tree = new DataBindingTree();

      tree.insert('Widget5.aa[a0].bb[a0].cc[a0]', 1);
      tree.insert('Widget5.aa[a0].bb[a0].cc[a1]', 2);
      tree.insert('Widget5.aa[a0].bb[a0]', 3);

      tree.getNode('Widget5.aa[a0].bb[a0].cc[a0]').getValue().should.equal(1);
      tree.getNode('Widget5.aa[a0].bb[a0].cc[a1]').getValue().should.equal(2);
      tree.getNode('Widget5.aa[a0].bb[a0]').getValue().should.equal(3);

      tree.insert('Widget5.aa[a0]', 4);
      // this last insert should _not_ push anything, so all should still be under aa[a0]
      tree.getNode('Widget5.aa[a0].bb[a0].cc[a0]').getValue().should.equal(1);
      tree.getNode('Widget5.aa[a0].bb[a0].cc[a1]').getValue().should.equal(2);
      tree.getNode('Widget5.aa[a0].bb[a0]').getValue().should.equal(3);
      tree.getNode('Widget5.aa[a0]').getValue().should.equal(4);

    });
    it('should support (nested) maps with multiple children', function() {
      var tree = new DataBindingTree();

      tree.insert('Widget5.aa[a0].bb[a0].cc[a0].a', 1);
      tree.insert('Widget5.aa[a0].bb[a0].cc[a0].b', 2);
      tree.insert('Widget5.aaa[a0].c', 3);
      tree.insert('Widget5.aaa[a0].d', 4);
      tree.insert('Widget5.aaa[a0].e', 5);

      tree.getNode('Widget5.aa[a0].bb[a0].cc[a0].a').getValue().should.equal(1);
      tree.getNode('Widget5.aa[a0].bb[a0].cc[a0].b').getValue().should.equal(2);
      tree.getNode('Widget5.aaa[a0].c').getValue().should.equal(3);
      tree.getNode('Widget5.aaa[a0].d').getValue().should.equal(4);
      tree.getNode('Widget5.aaa[a0].e').getValue().should.equal(5);

      tree.insert('Widget5.aaa[a0]', 6);
      // this last insert should _not_ push anything, so all should still be under aaa[a0]
      tree.getNode('Widget5.aaa[a0].c').getValue().should.equal(3);
      tree.getNode('Widget5.aaa[a0].d').getValue().should.equal(4);
      tree.getNode('Widget5.aaa[a0].e').getValue().should.equal(5);
      tree.getNode('Widget5.aaa[a0]').getValue().should.equal(6);

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

      tree.getNode('Widget5.children[1].children[3].children[1].children[1].children[0]').getValue().should.equal(5);

    });

    it('should support map/set inserts', function() {
      var tree = new DataBindingTree();

      var node0 = tree.insert('a', 0);
      should.exist(node0);
      var node1 = tree.insert('a.b.c[ab]', 1);
      should.exist(node1);
      var node2 = tree.insert('a.b.c[ab].d', 2);
      should.exist(node2);
      var node3 = tree.insert('a.b.c[1].e', 3);
      should.exist(node3);
      var node4 = tree.insert('a.b.c[cd].h.j', 4);
      should.exist(node4);
      var node5 = tree.insert('a.b.c["a[weird]index"].k', 5);
      should.exist(node5);

      // Should throw if no index provided
      (function() { tree.insert('a.b.c[]', 6); }).should.throw(Error);

      // Should throw if invalid index provided
      (function() { tree.insert('a.b.c[missingBracket', 6); }).should.throw(Error);

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
      node.should.equal(node0);

      node = tree.getNode('a.b.c[ab]');
      node.should.equal(node1);

      node = tree.getNode('a.b.c[ab].d');
      node.should.equal(node2);

      node = tree.getNode('a.b.c[1].e');
      node.should.equal(node3);

      node = tree.getNode('a.b.c[cd].h.j');
      node.should.equal(node4);

      node = tree.getNode('a.b.c["a[weird]index"].k');
      node.should.equal(node5);

      should.not.exist(tree.getNode('a.b.c[notInTheCollection]')); // Not in the collection
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
      tree.getNode('a.b.c[de].d').getValue().should.equal(1);
      tree.getNode('a.b.c[fg].d').getValue().should.equal(2);

      // Should not remove unknown paths
      should.not.exist(tree.remove('a.b.c[xy]'));
      (function() { tree.remove('a.b.c[xy'); }).should.throw(Error); // Invalid path should throw

      // Should remove sub-property
      var subtree = tree.remove('a.b.c[fg].d');
      subtree.getValue().should.equal(2);
      should.exist(tree.getNode('a.b.c[fg]'));

      // Should remove
      subtree = tree.remove('a.b.c[fg]');
      should.exist(subtree);
      should.not.exist(tree.getNode('a.b.c[fg]'));
      should.exist(tree.getNode('a.b.c[de]'));

      subtree = tree.remove('a.b.c[de]');
      should.exist(subtree);
      subtree.getNode('d').getValue().should.equal(1);
      should.not.exist(tree.getNode('a.b.c[de]'));
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
      closest.path.should.equal('');
      closest.node.should.equal(tree);

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
        closest.path.should.equal(path);
        closest.node.should.equal(tree.getNode(path));

        // Closest node should be the most recent node in a path
        var notAPath = path + '.not.a.path';
        closest = tree.getClosestNode(notAPath);
        closest.path.should.equal(path);
        closest.node.should.equal(tree.getNode(path));
      }

      // Special cases
      closest = tree.getClosestNode('a.b.c[100]');
      closest.path.should.equal('a.b');
      closest.node.should.equal(tree.getNode('a.b'));

      closest = tree.getClosestNode('a.b.d[notAKey]');
      closest.path.should.equal('a.b.d');
      closest.node.should.equal(tree.getNode('a.b.d'));
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
      closest.path.should.equal('');
      closest.node.should.equal(tree);

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
        closest.path.should.equal(path.substr(1)); // we never get back the leading '/'
        closest.node.should.equal(tree.getNode(path));

        // Closest node should be the most recent node in a path
        var notAPath = path + '.not.a.path';
        closest = tree.getClosestNode(notAPath);
        closest.path.should.equal(path.substr(1)); // we never get back the leading '/'
        closest.node.should.equal(tree.getNode(path));
      }

      // Special cases
      closest = tree.getClosestNode('/a.b.c[100]');
      closest.path.should.equal('a.b');
      closest.node.should.equal(tree.getNode('a.b'));

      closest = tree.getClosestNode('/a.b.d[notAKey]');
      closest.path.should.equal('a.b.d');
      closest.node.should.equal(tree.getNode('a.b.d'));
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
      sum.should.equal(36);
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
      paths.length.should.equal(4); // Only returns children one level down. I.e. Nodes labeled 'z' won't be returned
      subtreePaths.size.should.equal(8); // this includes all children recursively

      tree.getNode('a').should.equal(children['a']);
      tree.getNode('b[0]').should.equal(children['b'].getChild(0));
      tree.getNode('c[a]').should.equal(children['c'].getChild('a'));
      tree.getNode('d').should.equal(children['d']);

      subtreePaths.has('a').should.equal(true);
      subtreePaths.has('b[0]').should.equal(true);
      subtreePaths.has('c.a').should.equal(true);
      subtreePaths.has('b[0].z').should.equal(true);
      subtreePaths.has('c.a.z').should.equal(true);
      subtreePaths.has('d').should.equal(true);
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
      subtreePaths.size.should.equal(27); // this includes all children recursively
      subtreePaths.has('a').should.equal(true);
      subtreePaths.has('a.x').should.equal(true);
      subtreePaths.has('a.x.z').should.equal(true);
      subtreePaths.has('a.y').should.equal(true);
      subtreePaths.has('a.z').should.equal(true);
      subtreePaths.has('a.xxx').should.equal(true);

      subtreePaths.has('b').should.equal(true);
      subtreePaths.has('b[0]').should.equal(true);
      subtreePaths.has('b[0].z').should.equal(true);

      subtreePaths.has('b[1]').should.equal(true);
      subtreePaths.has('b[2]').should.equal(true);
      subtreePaths.has('b[2].k').should.equal(true);
      subtreePaths.has('b[2].k.f').should.equal(true);
      subtreePaths.has('b[2].k.f[0]').should.equal(true);
      subtreePaths.has('b[2].k.f[0].foobar').should.equal(true);

      subtreePaths.has('b[2].f').should.equal(true);
      subtreePaths.has('b[2].f[0]').should.equal(true);
      subtreePaths.has('b[2].f[0].yikes').should.equal(true);

      subtreePaths.has('c').should.equal(true);
      subtreePaths.has('c.a').should.equal(true);
      subtreePaths.has('c.a.z').should.equal(true);
      subtreePaths.has('c.b').should.equal(true);
      subtreePaths.has('c.b.t').should.equal(true);
      subtreePaths.has('c.b.t.k').should.equal(true);
      subtreePaths.has('c.b.t.w').should.equal(true);
      subtreePaths.has('c.b.t.w.a').should.equal(true);

      subtreePaths.has('d').should.equal(true);

    });

    it('should return whether it has children correctly', function() {
      var tree = new DataBindingTree();
      tree.hasChildren().should.equal(false);
      tree.insert('a', 1);
      tree.hasChildren().should.equal(true);
      tree.insert('b[0]', 2);
      tree.getNode('b[0]').hasChildren().should.equal(false);
      tree.getNode('b[0]').insert('z', -1);
      tree.getNode('b[0]').hasChildren().should.equal(true);
      tree.insert('c[a]', 3);
      tree.getNode('c[a]').hasChildren().should.equal(false);
      tree.insert('c[a].z', -1);
      tree.getNode('c[a]').hasChildren().should.equal(true);
      tree.insert('d', 4);
      tree.getNode('d').hasChildren().should.equal(false);
    });

  });
})();
