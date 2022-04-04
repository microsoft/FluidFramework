/*Scenario A
In a trait foo that contains the nodes [A B C D], three users concurrently attempt the following operations (ordered here from first sequenced to last sequenced):
User 1: delete B C
User 2: move slice-like range B C D to some other trait bar
User 3: insert X after B

Depending on the movement rules specified for the insertion of X, itâ€™s possible that X should end up in trait bar as the outcome of rebasing user 3â€™s edit on the prior two. In order for that to be possible, we need to preserve the fact that the move operation performed by user 2 was targeted not only at node D but also at nodes B and C. We also need to preserve the fact that the insertion of X was made with respect to B. This is challenging because the third edit will be rebased over the deletion of B C. This last point also holds for insertions of detached content (i.e., â€œMoveInâ€)

Takeaways:
We need to preserve the layering of moves over deletions.
We need to know which move operations apply to which nodes, even when they are deleted.
We need to know which node a given insertion or move-in was relative to.*/

let CS_U1 = {
	modify: {
	  "array<>": {
		foo: {
		  remove: [[1, ["B", "C"]]]
		}
	  }
	}
  }
  let CS_U2 = {
	modify: {
	  "array<>": {
		foo: {
		  moveOut: [[1, 3, "bar[0]", 'slice']]
		},
		bar: {
		  moveIn: [[0, 3, "foo[1]", 'slice']]
		}
	  }
	}
  }
  
  let CS_U3 = {
	modify: {
	  "array<>": {
		foo: {
		  insert: [[1.9, ['X'], 'followMoves']]
		}
	  }
	}
  }
  
  CS_U2_rebased = {
	modify: {
	  "array<>": {
		foo: {
		  moveOut: [[0.9, 1, "bar[0]", 'slice']] // Rebasing the slice move is tricky. It does work in this case, because the slice and the remove are aligned, but I think there would have been a bigger problem if the slice range would have started at C. That could not have been expressed as a change purely relative to the state after the change from U1.
		},
		bar: {
		  moveIn: [[0, 1, "foo[0.9]", 'slice']]
		}
	  }
	}
  }
  
  // We would now have two options how to represent the squashed version
  CS_U1_U2_squashed = {
	modify: {
	  "array<>": {
		foo: {
		  remove: [[1, ["B", "C"]]], // Removing the entries in the original array
		  moveOut: [[0.9, 3, "bar[0]", 'slice']] // and creating a slice range overlapping with the remove
		},
		bar: {
		  moveIn: [[0, 1, "foo[0.9]", 'slice']]
		}
	  }
	}
  }
  CS_U1_U2_squashed_2 = {
	modify: {
	  "array<>": {
		foo: {
		  moveOut: [[0.9, 3, "bar[0]", 'slice']] // moving the range
		},
		bar: {
		  moveIn: [[0, 3, "foo[0.9]", 'slice', {
			remove: [[0, ["B", "C"]]] // and applying the remove as a nested edit
		  }]]
		}
	  }
	}
  }
  
  let CS_U3_rebased = {
	modify: {
	  "array<>": {
		bar: { // This would get rebased to bar, because of the slice like move above
		  insert: [[1.9, ['X'], 'followMoves']]
		}
	  }
	}
  }
  
  // This is a quite tricky case. Especially, if we try resolve the more complex case, where the slice range
  // starts at C, where the behaviour would be different for an insert after B and after C. In that case,
  // it is no longer possible to express the semantics of the rebased edit 2, with respect to its base state,
  // since in this state, B and C are not distinguished, The information necessary to rebase the change made
  // by user 3 can only be, derived by essentially preserving the history along which edit 2 has been rebased.
  // An alternative would be to keep grave stones for all elements that ever existed indefinitely around, but
  // that could potentially be very expensive.
  
  /*
  Scenario B
  In a trait P.foo that contains the node [A], two users concurrently attempt the following operations (ordered here from first sequenced to last sequenced):
  User 1: move set-like range [A] to some other trait P.bar
  User 1: move set-like range [A] to some other trait Q.baz
  User 2: insert X after A
  
  Depending on the movement rules specified for the insertion of X, itâ€™s possible that X should end up in trait bar. For that to be possible, we need to preserve the fact that A was moved to trait bar at all.
  
  Itâ€™s also possible for X to end up in trait baz (even though it would have ended up in trait bar had user 2 not performed its edit). For that to be possible, we need to preserve the fact that A was moved to trait baz after being moved to trait bar.
  
  Takeaways:
  We need to preserve the layering of moves over moves.
  We canâ€™t squash sequences of moves into a single move.
  We need to preserve the relative ordering of moves.
  */
  let CS_U1_1 = {
	modify: {
	  "NodeProperty": {
		P: {
		  modify: {
			"array<>": {
			  foo: {
				moveOut: [[0, "P.bar[0]", "set"]]
			  },
			  bar: {
				moveIn: [[0, "P.foo[0]", "set"]]
			  }
			}
		  }
		}
	  }
	}
  };
  
  let CS_U1_2 = {
	modify: {
	  "NodeProperty": {
		P: {
		  modify: {
			"array<>": {
			  foo: {
				moveOut: [[0, "Q.baz[0]", "set"]]
			  },
			}
		  }
		},
		Q: {
		  modify: {
			"array<>": {
			  bar: {
				moveIn: [[0, "P.bar[0]", "set"]]
			  }
			}
		  }
		}
	  }
	}
  };
  
  let CS_U2 = {
	modify: {
	  "NodeProperty": {
		P: {
		  modify: {
			"array<>": {
			  foo: {
				insert: [[0.9, ['X'], 'followMoves', {notAllowedParentID: 'baz'}]]
			  },
			}
		  }
		}
	  }
	}
  };
  
  let CS_U1_2 = {
	modify: {
	  "NodeProperty": {
		P: {
		  modify: {
			"array<>": {
			  foo: {
				moveOut: [[0, ["P.bar[0]", "Q.baz[0]"], "set"]] // if we allow rules based on the movement history, we need to keep all intermediate steps
			  },
			}
		  }
		},
		Q: {
		  modify: {
			"array<>": {
			  bar: {
				moveIn: [[0, ["P.foo[0]", "P.bar[0]"], "set"]]
			  }
			}
		  }
		}
	  }
	}
  };
  
  let CS_U2_rebased = {
	modify: {
	  "NodeProperty": {
		P: {
		  modify: {
			"array<>": {
			  foo: {
				insert: [[0, ['X'], 'doNotFollowMoves', {notAllowedParentID: 'baz'}]] // Note we have to decrement the index here, since x is no longer at the target position, and we do no longer have a preference to left or right. We probably don't won't to follow further moves of neighbours, because we don't know in which relation they are to X
			  },
			}
		  }
		}
	  }
	}
  };
  /*Scenario C
  User 1: insert B after A
  User 1: move B to some other trait bar
  User 2: insert X after B <- done with knowledge of edit #1
  
  We need to allow for X to be inserted to into the foo trait (as opposed to following B into the bar trait).
  
  Takeaways:
  We need to preserve the layering of moves over insertions.
  It is not sufficient to represent insertions of content that is subsequently moved as insertions in their final location.
  Note: this scenario motivates this being is true across commits but not within commits.*/
  
  // Since User 2 performs edit with knowledge of the first edit, we can assume that this is part of the base state
  // Base state foo = [A, B]
  
  let CS_U1 = {
	modify: {
	  "array<>": {
		foo: {
		  moveOut: [[0, 1, "bar[0]", 'set']]
		},
		bar: {
		  moveIn: [[0, 1, "foo[0]", 'set']]
		}
	  }
	}
  }
  
  let CS_U2 = {
	modify: {
	  "array<>": {
		foo: {
		  insert: [[0.9, ["X"], 'followMoves']]
		}
	  }
	}
  }
  
  // > We need to allow for X to be inserted to into the foo trait (as opposed to following B into the bar trait).
  // I don't understand this expectation. Why is X supposed to stay in foo? If a follow movement rule is specified,
  // why wouldn't it follow B?
  
  
  /*Scenario D
  In trait foo [A B C]:
  User 1: move B to some other trait bar
  User 2 in one commit:
  insert X after B (with always-move semantics)
  move slice-like range [A B X C] to some other trait baz
  
  We need to allow for B to be inserted to into the bar trait (as opposed to ending up in the baz trait).
  
  Takeaways:
  We need to preserve the layering of moves over insertions.
  It is not sufficient to represent insertions of content that is subsequently moved as insertions in their final location.
  Note: this scenario motivates this being is true within commits but not across commits.
  */
  
  let CS_U1 = {
	modify: {
	  "array<>": {
		foo: {
		  moveOut: [[1, 1, "bar[0]", 'set']]
		},
		bar: {
		  moveIn: [[0, 1, "foo[1]", 'set']]
		}
	  }
	}
  }
  
  let CS_U2 = {
	modify: {
	  "array<>": {
		foo: {
		  moveOut: [[0, 3, "baz[0]", 'slice']]
		},
		baz: {
		  moveIn: [[0, 3, "foo[0]", 'slice', {
			insert: [[1.9, ['X']], 'followMoves']
		  }]]
		}
	  }
	}
  }
  let CS_U2_rebased = {
	modify: {
	  "array<>": {
		foo: {
		  moveOut: [[0, 3, "baz[0]", 'slice']]
		},
		bar: {
		  insert: [[0.9, ['X']], 'followMoves']
		},
		baz: {
		  moveIn: [[0, 3, "foo[0]", 'slice']]
		}
	  }
	}
  }
  
  /*
  Scenario E
  In trait foo [A B C]:
  User 1: move B to some other trait bar
  User 2 in one commit:
  insert X after B (with always-move semantics)
  delete slice-like range [A B X C]
  
  We need to allow for B to be inserted to into the bar trait (as opposed to ending up deleted).
  
  Takeaways:
  We need to preserve the layering of deletions over moves.
  It is not sufficient to represent deletions of content that was previously moved as deletions in their original location.
  */
  
  let CS_U1 = {
	modify: {
	  "array<>": {
		foo: {
		  moveOut: [[1, 1, "bar[0]", 'set']]
		},
		bar: {
		  moveIn: [[0, 1, "foo[1]", 'set']]
		}
	  }
	}
  }
  
  // > We need to allow for B to be inserted to into the bar trait (as opposed to ending up deleted).
  // Is this the intended behaviour? You specifically say, it happens in one commit, so this would break a transaction
  // boundary. At the moment, this behaviour could not be expressed, in a CS, because the combination remove + insert
  // is supposed to be executed in the opposite order. We could add rules for this, but I assume you expect an arbitrary
  // nesting of the operations.