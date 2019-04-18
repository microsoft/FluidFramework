package main

import (
	"fmt"
	"os"
	"testing"
	"time"
)

var (
	metaStoreTest *MetaStore
)

func TestGetMeta(t *testing.T) {
	setupMeta()
	defer teardownMeta()

	meta, err := metaStoreTest.Get(&RequestVars{Oid: contentOid})
	if err != nil {
		t.Fatalf("Error retreiving meta: %s", err)
	}

	if meta.Oid != contentOid {
		t.Errorf("expected to get content oid, got: %s", meta.Oid)
	}

	if meta.Size != contentSize {
		t.Errorf("expected to get content size, got: %d", meta.Size)
	}
}

func TestPutMeta(t *testing.T) {
	setupMeta()
	defer teardownMeta()

	meta, err := metaStoreTest.Put(&RequestVars{Oid: nonExistingOid, Size: 42})
	if err != nil {
		t.Errorf("expected put to succeed, got : %s", err)
	}

	if meta.Existing {
		t.Errorf("expected meta to not have existed")
	}

	meta, err = metaStoreTest.Get(&RequestVars{Oid: nonExistingOid})
	if err != nil {
		t.Errorf("expected to be able to retreive new put, got : %s", err)
	}

	if meta.Oid != nonExistingOid {
		t.Errorf("expected oids to match, got: %s", meta.Oid)
	}

	if meta.Size != 42 {
		t.Errorf("expected sizes to match, got: %d", meta.Size)
	}

	meta, err = metaStoreTest.Put(&RequestVars{Oid: nonExistingOid, Size: 42})
	if err != nil {
		t.Errorf("expected put to succeed, got : %s", err)
	}

	if !meta.Existing {
		t.Errorf("expected meta to now exist")
	}
}

func TestLocks(t *testing.T) {
	setupMeta()
	defer teardownMeta()

	for i := 0; i < 5; i++ {
		lock := NewTestLock(randomLockId(), fmt.Sprintf("path-%d", i), fmt.Sprintf("user-%d", i))
		if err := metaStoreTest.AddLocks(testRepo, lock); err != nil {
			t.Errorf("expected AddLocks to succeed, got : %s", err)
		}
	}

	locks, err := metaStoreTest.Locks(testRepo)
	if err != nil {
		t.Errorf("expected Locks to succeed, got : %s", err)
	}
	if len(locks) != 5 {
		t.Errorf("expected returned lock count to match, got: %d", len(locks))
	}
}

func TestFilteredLocks(t *testing.T) {
	setupMeta()
	defer teardownMeta()

	testLocks := make([]Lock, 0, 5)
	for i := 0; i < 5; i++ {
		lock := NewTestLock(randomLockId(), fmt.Sprintf("path-%d", i), fmt.Sprintf("user-%d", i))
		testLocks = append(testLocks, lock)
	}
	if err := metaStoreTest.AddLocks(testRepo, testLocks...); err != nil {
		t.Errorf("expected AddLocks to succeed, got : %s", err)
	}

	locks, next, err := metaStoreTest.FilteredLocks(testRepo, "", "", "3")
	if err != nil {
		t.Errorf("expected FilteredLocks to succeed, got : %s", err)
	}
	if len(locks) != 3 {
		t.Errorf("expected locks count to match limit, got: %d", len(locks))
	}
	if next == "" {
		t.Errorf("expected next to exist")
	}

	locks, next, err = metaStoreTest.FilteredLocks(testRepo, "", next, "2")
	if err != nil {
		t.Errorf("expected FilteredLocks to succeed, got : %s", err)
	}
	if len(locks) != 2 {
		t.Errorf("expected locks count to match limit, got: %d", len(locks))
	}
	if next != "" {
		t.Errorf("expected next to not exist, got: %s", next)
	}
}

func TestAddLocks(t *testing.T) {
	setupMeta()
	defer teardownMeta()

	lock := NewTestLock(lockId, lockPath, testUser)
	if err := metaStoreTest.AddLocks(testRepo, lock); err != nil {
		t.Errorf("expected AddLocks to succeed, got : %s", err)
	}

	locks, _, err := metaStoreTest.FilteredLocks(testRepo, lock.Path, "", "1")
	if err != nil {
		t.Errorf("expected FilteredLocks to succeed, got : %s", err)
	}
	if len(locks) != 1 {
		t.Errorf("expected lock to be existed")
	}
	if locks[0].Id != lockId {
		t.Errorf("expected lockId to match, got: %s", locks[0])
	}
}

func TestDeleteLock(t *testing.T) {
	setupMeta()
	defer teardownMeta()

	lock := NewTestLock(lockId, lockPath, testUser)
	if err := metaStoreTest.AddLocks(testRepo, lock); err != nil {
		t.Errorf("expected AddLocks to succeed, got : %s", err)
	}

	deleted, err := metaStoreTest.DeleteLock(testRepo, testUser, lock.Id, false)
	if err != nil {
		t.Errorf("expected DeleteLock to succeed, got : %s", err)
	}
	if deleted == nil || deleted.Id != lock.Id {
		t.Errorf("expected deleted lock to be returned, got : %s", deleted)
	}
}

func TestDeleteLockNotOwner(t *testing.T) {
	setupMeta()
	defer teardownMeta()

	lock := NewTestLock(lockId, lockPath, testUser)
	if err := metaStoreTest.AddLocks(testRepo, lock); err != nil {
		t.Errorf("expected AddLocks to succeed, got : %s", err)
	}

	deleted, err := metaStoreTest.DeleteLock(testRepo, testUser1, lock.Id, false)
	if err == nil || deleted != nil {
		t.Errorf("expected DeleteLock to failed")
	}

	if err != errNotOwner {
		t.Errorf("expected DeleteLock error match, got: %s", err)
	}
}

func TestDeleteLockNotOwnerForce(t *testing.T) {
	setupMeta()
	defer teardownMeta()

	lock := NewTestLock(lockId, lockPath, testUser)
	if err := metaStoreTest.AddLocks(testRepo, lock); err != nil {
		t.Errorf("expected AddLocks to succeed, got : %s", err)
	}

	deleted, err := metaStoreTest.DeleteLock(testRepo, testUser1, lock.Id, true)
	if err != nil {
		t.Errorf("expected DeleteLock(force) to succeed, got : %s", err)
	}
	if deleted == nil || deleted.Id != lock.Id {
		t.Errorf("expected deleted lock to be returned, got : %s", deleted)
	}
}

func TestDeleteLockNonExisting(t *testing.T) {
	setupMeta()
	defer teardownMeta()

	lock := NewTestLock(lockId, lockPath, testUser)
	if err := metaStoreTest.AddLocks(testRepo, lock); err != nil {
		t.Errorf("expected AddLocks to succeed, got : %s", err)
	}

	deleted, err := metaStoreTest.DeleteLock(testRepo, testUser, nonExistingLockId, false)
	if err != nil {
		t.Errorf("expected DeleteLock to succeed, got : %s", err)
	}
	if deleted != nil {
		t.Errorf("expected nil returned, got : %s", deleted)
	}
}

func NewTestLock(id, path, user string) Lock {
	return Lock{
		Id:   id,
		Path: path,
		Owner: User{
			Name: user,
		},
		LockedAt: time.Now(),
	}
}

func setupMeta() {
	store, err := NewMetaStore("test-meta-store.db")
	if err != nil {
		fmt.Printf("error initializing test meta store: %s\n", err)
		os.Exit(1)
	}

	metaStoreTest = store
	if err := metaStoreTest.AddUser(testUser, testPass); err != nil {
		teardownMeta()
		fmt.Printf("error adding test user to meta store: %s\n", err)
		os.Exit(1)
	}

	rv := &RequestVars{Oid: contentOid, Size: contentSize}
	if _, err := metaStoreTest.Put(rv); err != nil {
		teardownMeta()
		fmt.Printf("error seeding test meta store: %s\n", err)
		os.Exit(1)
	}
}

func teardownMeta() {
	metaStoreTest.Close()
	os.RemoveAll("test-meta-store.db")
}
