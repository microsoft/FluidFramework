package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestGetAuthed(t *testing.T) {
	res, err := api("GET", "/user/repo/objects/"+contentOid, contentMediaType, testUser, testPass, nil)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}

	if res.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d", res.StatusCode)
	}

	by, err := ioutil.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("expected response to contain content, got error: %s", err)
	}

	if string(by) != content {
		t.Fatalf("expected content to be `content`, got: %s", string(by))
	}
}

func TestGetAuthedWithRange(t *testing.T) {
	req, err := http.NewRequest("GET", lfsServer.URL+"/user/repo/objects/"+contentOid, nil)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}
	req.SetBasicAuth(testUser, testPass)
	req.Header.Set("Accept", contentMediaType)
	fromByte := 5
	req.Header.Set("Range", fmt.Sprintf("bytes=%d-", fromByte))

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("response error: %s", err)
	}

	if res.StatusCode != 206 {
		t.Fatalf("expected status 206, got %d", res.StatusCode)
	}
	if cr := res.Header.Get("Content-Range"); len(cr) > 0 {
		expected := fmt.Sprintf("bytes %d-%d/%d", fromByte, len(content)-1, len(content)-fromByte)
		if cr != expected {
			t.Fatalf("expected Content-Range header of %q, got %q", expected, cr)
		}
	} else {
		t.Fatalf("missing Content-Range header in response")
	}

	by, err := ioutil.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("expected response to contain content, got error: %s", err)
	}

	if string(by) != content[fromByte:] {
		t.Fatalf("expected content to be `content`, got: %s", string(by))
	}
}

func TestGetUnAuthed(t *testing.T) {
	res, err := api("GET", "/user/repo/objects/"+contentOid, contentMediaType, "", "", nil)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}

	if res.StatusCode != 401 {
		t.Fatalf("expected status 401, got %d", res.StatusCode)
	}
}

func TestGetBadAuth(t *testing.T) {
	res, err := api("GET", "/user/repo/objects/"+contentOid, contentMediaType, testUser, testPass+"123", nil)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}

	if res.StatusCode != 401 {
		t.Fatalf("expected status 401, got %d", res.StatusCode)
	}
}

func TestGetMetaAuthed(t *testing.T) {
	res, err := api("GET", "/bilbo/repo/objects/"+contentOid, metaMediaType, testUser, testPass, nil)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}

	if res.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d", res.StatusCode)
	}

	var meta Representation
	dec := json.NewDecoder(res.Body)
	dec.Decode(&meta)

	if meta.Oid != contentOid {
		t.Fatalf("expected to see oid `%s` in meta, got: `%s`", contentOid, meta.Oid)
	}

	if meta.Size != contentSize {
		t.Fatalf("expected to see a size of `%d`, got: `%d`", contentSize, meta.Size)
	}

	download := meta.Actions["download"]
	if download.Href != "http://localhost:8080/bilbo/repo/objects/"+contentOid {
		t.Fatalf("expected download link, got %s", download.Href)
	}
}

func TestGetMetaUnAuthed(t *testing.T) {
	res, err := api("GET", "/user/repo/objects/"+contentOid, metaMediaType, "", "", nil)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}

	if res.StatusCode != 401 {
		t.Fatalf("expected status 401, got %d", res.StatusCode)
	}
}

func TestPostAuthedNewObject(t *testing.T) {
	buf := bytes.NewBufferString(fmt.Sprintf(`{"oid":"%s", "size":1234}`, nonExistingOid))
	res, err := api("POST", "/bilbo/repo/objects", metaMediaType, testUser, testPass, buf)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}

	if res.StatusCode != 202 {
		t.Fatalf("expected status 202, got %d", res.StatusCode)
	}

	var meta Representation
	dec := json.NewDecoder(res.Body)
	dec.Decode(&meta)

	if meta.Oid != nonExistingOid {
		t.Fatalf("expected to see oid `%s` in meta, got: `%s`", nonExistingOid, meta.Oid)
	}

	if meta.Size != 1234 {
		t.Fatalf("expected to see a size of `1234`, got: `%d`", meta.Size)
	}

	if download, ok := meta.Actions["download"]; ok {
		t.Fatalf("expected POST to not contain a download link, got %s", download.Href)
	}

	upload, ok := meta.Actions["upload"]
	if !ok {
		t.Fatal("expected upload link to be present")
	}

	if upload.Href != "http://localhost:8080/bilbo/repo/objects/"+nonExistingOid {
		t.Fatalf("expected upload link, got %s", upload.Href)
	}
}

func TestPostAuthedExistingObject(t *testing.T) {
	buf := bytes.NewBufferString(fmt.Sprintf(`{"oid":"%s", "size":%d}`, contentOid, contentSize))
	res, err := api("POST", "/bilbo/repo/objects", metaMediaType, testUser, testPass, buf)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}
	if res.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d", res.StatusCode)
	}

	var meta Representation
	dec := json.NewDecoder(res.Body)
	dec.Decode(&meta)

	if meta.Oid != contentOid {
		t.Fatalf("expected to see oid `%s` in meta, got: `%s`", contentOid, meta.Oid)
	}

	if meta.Size != contentSize {
		t.Fatalf("expected to see a size of `%d`, got: `%d`", contentSize, meta.Size)
	}

	download := meta.Actions["download"]
	if download.Href != "http://localhost:8080/bilbo/repo/objects/"+contentOid {
		t.Fatalf("expected download link, got %s", download.Href)
	}

	upload, ok := meta.Actions["upload"]
	if !ok {
		t.Fatalf("expected upload link to be present")
	}

	if upload.Href != "http://localhost:8080/bilbo/repo/objects/"+contentOid {
		t.Fatalf("expected upload link, got %s", upload.Href)
	}
}

func TestPostUnAuthed(t *testing.T) {
	buf := bytes.NewBufferString(fmt.Sprintf(`{"oid":"%s", "size":%d}`, contentOid, contentSize))
	res, err := api("POST", "/bilbo/readonly/objects", metaMediaType, "", "", buf)
	if err != nil {
		t.Fatalf("response error: %s", err)
	}

	if res.StatusCode != 401 {
		t.Fatalf("expected status 401, got %d", res.StatusCode)
	}
}

func TestPut(t *testing.T) {
	req, err := http.NewRequest("PUT", lfsServer.URL+"/user/repo/objects/"+contentOid, nil)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}
	req.SetBasicAuth(testUser, testPass)
	req.Header.Set("Accept", contentMediaType)
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Body = ioutil.NopCloser(bytes.NewBuffer([]byte(content)))

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("response error: %s", err)
	}

	if res.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d", res.StatusCode)
	}

	r, err := testContentStore.Get(&MetaObject{Oid: contentOid}, 0)
	if err != nil {
		t.Fatalf("error retreiving from content store: %s", err)
	} else {
		defer r.Close()
	}
	c, err := ioutil.ReadAll(r)
	if err != nil {
		t.Fatalf("error reading content: %s", err)
	}
	if string(c) != content {
		t.Fatalf("expected content, got `%s`", string(c))
	}
}

func TestMediaTypesRequired(t *testing.T) {
	m := []string{"GET", "PUT", "POST", "HEAD"}
	for _, method := range m {
		res, err := api(method, "/user/repo/objects/"+contentOid, "", testUser, testPass, nil)
		if err != nil {
			t.Fatalf("request error: %s", err)
		}
		if res.StatusCode != 404 {
			t.Fatalf("expected status 404, got %d", res.StatusCode)
		}
	}
}

func TestMediaTypesParsed(t *testing.T) {
	accept := contentMediaType + "; charset=utf-8"
	res, err := api("GET", "/user/repo/objects/"+contentOid, accept, testUser, testPass, nil)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}
	if res.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d", res.StatusCode)
	}
}

func TestLocksList(t *testing.T) {
	res, err := api("GET", "/user/repo/locks", metaMediaType, testUser, testPass, nil)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}

	if res.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d", res.StatusCode)
	}

	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("expected response to contain content, got error: %s", err)
	}

	var list LockList
	if err := json.Unmarshal(body, &list); err != nil {
		t.Fatalf("expected response body to be LockList, got error: %s", err)
	}
	if len(list.Locks) != 1 {
		t.Errorf("expected returned lock count to match, got: %d", len(list.Locks))
	}
	if list.Locks[0].Id != lockId {
		t.Errorf("expected lockId to match, got: %s", list.Locks[0].Id)
	}
}

func TestLocksListUnAuthed(t *testing.T) {
	res, err := api("GET", "/user/repo/locks", metaMediaType, "", "", nil)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}

	if res.StatusCode != 401 {
		t.Fatalf("expected status 401, got %d", res.StatusCode)
	}
}

func TestLocksVerify(t *testing.T) {
	buf := bytes.NewBufferString(fmt.Sprintf(`{"cursor": "", "limit": 0}`))
	res, err := api("POST", "/user/repo/locks/verify", metaMediaType, testUser, testPass, buf)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}

	if res.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d", res.StatusCode)
	}

	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("expected response to contain content, got error: %s", err)
	}

	var list VerifiableLockList
	if err := json.Unmarshal(body, &list); err != nil {
		t.Fatalf("expected response body to be VerifiableLockList, got error: %s", err)
	}
}

func TestLocksVerifyUnAuthed(t *testing.T) {
	buf := bytes.NewBufferString(fmt.Sprintf(`{"cursor": "", "limit": 0}`))
	res, err := api("POST", "/user/repo/locks/verify", metaMediaType, "", "", buf)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}

	if res.StatusCode != 401 {
		t.Fatalf("expected status 401, got %d", res.StatusCode)
	}
}

func TestLock(t *testing.T) {
	path := "TestLock"
	lock, err := createLock(testUser, testPass, path)
	if err != nil {
		t.Fatalf("create lock error: %s", err)
	}
	if lock == nil {
		t.Errorf("expected lock to be created, got: %s", lock)
	}
	if lock.Owner.Name != testUser {
		t.Errorf("expected lock owner to be match, got: %s", lock.Owner.Name)
	}
	if lock.Path != path {
		t.Errorf("expected lock path to be match, got: %s", lock.Path)
	}
}

func TestLockExists(t *testing.T) {
	l, err := createLock(testUser, testPass, "TestLockExists")
	if err != nil {
		t.Fatalf("create lock error: %s", err)
	}

	buf := bytes.NewBufferString(fmt.Sprintf(`{"path":"%s"}`, l.Path))
	res, err := api("POST", "/user/repo/locks", metaMediaType, testUser, testPass, buf)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}

	if res.StatusCode != 409 {
		t.Fatalf("expected status 409, got %d", res.StatusCode)
	}
}

func TestLockUnAuthed(t *testing.T) {
	buf := bytes.NewBufferString(fmt.Sprintf(`{"path":"%s"}`, "TestLockUnAuthed"))
	res, err := api("POST", "/user/repo/locks", metaMediaType, "", "", buf)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}

	if res.StatusCode != 401 {
		t.Fatalf("expected status 401, got %d", res.StatusCode)
	}
}

func TestUnlock(t *testing.T) {
	l, err := createLock(testUser, testPass, "TestUnlock")
	if err != nil {
		t.Fatalf("create lock error: %s", err)
	}

	buf := bytes.NewBufferString(fmt.Sprintf(`{"force": %t}`, false))
	res, err := api("POST", "/user/repo/locks/"+l.Id+"/unlock", metaMediaType, testUser, testPass, buf)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}
	if res.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d", res.StatusCode)
	}

	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("expected response to contain content, got error: %s", err)
	}

	var unlockResponse UnlockResponse
	if err := json.Unmarshal(body, &unlockResponse); err != nil {
		t.Fatalf("expected response body to be UnlockResponse, got error: %s", err)
	}
	lock := unlockResponse.Lock
	if lock == nil || lock.Id != l.Id {
		t.Errorf("expected deleted lock to be returned, got: %s", lock)
	}
}

func TestUnLockUnAuthed(t *testing.T) {
	l, err := createLock(testUser, testPass, "TestUnLockUnAuthed")
	if err != nil {
		t.Fatalf("create lock error: %s", err)
	}

	buf := bytes.NewBufferString(fmt.Sprintf(`{"force": %t}`, false))
	res, err := api("POST", "/user/repo/locks/"+l.Id+"/unlock", metaMediaType, "", "", buf)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}

	if res.StatusCode != 401 {
		t.Fatalf("expected status 401, got %d", res.StatusCode)
	}
}

func TestUnlockNotOwner(t *testing.T) {
	l, err := createLock(testUser, testPass, "TestUnlockNotOwner")
	if err != nil {
		t.Fatalf("create lock error: %s", err)
	}

	buf := bytes.NewBufferString(fmt.Sprintf(`{"force": %t}`, false))
	res, err := api("POST", "/user/repo/locks/"+l.Id+"/unlock", metaMediaType, testUser1, testPass1, buf)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}
	if res.StatusCode != 403 {
		t.Fatalf("expected status 403, got %d", res.StatusCode)
	}
}

func TestUnlockNotOwnerForce(t *testing.T) {
	l, err := createLock(testUser, testPass, "TestUnlockNotOwnerForce")
	if err != nil {
		t.Fatalf("create lock error: %s", err)
	}

	buf := bytes.NewBufferString(fmt.Sprintf(`{"force": %t}`, true))
	res, err := api("POST", "/user/repo/locks/"+l.Id+"/unlock", metaMediaType, testUser1, testPass1, buf)
	if err != nil {
		t.Fatalf("request error: %s", err)
	}
	if res.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d", res.StatusCode)
	}
}

func createLock(username, password, path string) (*Lock, error) {
	buf := bytes.NewBufferString(fmt.Sprintf(`{"path":"%s"}`, path))
	res, err := api("POST", "/user/repo/locks", metaMediaType, username, password, buf)
	if err != nil {
		return nil, fmt.Errorf("request error: %s", err)
	}

	if res.StatusCode != 201 {
		return nil, fmt.Errorf("expected status 201, got %d", res.StatusCode)
	}

	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		return nil, fmt.Errorf("expected response to contain content, got error: %s", err)
	}

	var lockResponse LockResponse
	if err := json.Unmarshal(body, &lockResponse); err != nil {
		return nil, fmt.Errorf("expected response body to be LockResponse, got error: %s", err)
	}
	return lockResponse.Lock, nil
}

// simple http client for making api request
func api(method, path, accept, username, password string, body *bytes.Buffer) (*http.Response, error) {
	req, err := http.NewRequest(method, lfsServer.URL+path, nil)
	if err != nil {
		return nil, err
	}
	if accept != "" {
		req.Header.Set("Accept", accept)
	}
	if username != "" || password != "" {
		req.SetBasicAuth(username, password)
	}
	if (method == "POST" || method == "PUT") && body != nil {
		req.Body = ioutil.NopCloser(body)
	}

	return http.DefaultClient.Do(req)
}

var (
	lfsServer        *httptest.Server
	testMetaStore    *MetaStore
	testContentStore *ContentStore
)

const (
	testUser          = "bilbo"
	testPass          = "baggins"
	testUser1         = "bilbo1"
	testPass1         = "baggins1"
	testRepo          = "repo"
	content           = "this is my content"
	contentSize       = int64(len(content))
	contentOid        = "f97e1b2936a56511b3b6efc99011758e4700d60fb1674d31445d1ee40b663f24"
	nonExistingOid    = "aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f"
	lockId            = "3cfec93346f7ff337c60f2da50cd86740715e2f6"
	nonExistingLockId = "f310c1555a2485e2e5229ea015a94c9d590763d3"
	lockPath          = "this/is/lock/path"
)

func TestMain(m *testing.M) {
	os.Remove("lfs-test.db")

	var err error
	testMetaStore, err = NewMetaStore("lfs-test.db")
	if err != nil {
		fmt.Printf("Error creating meta store: %s", err)
		os.Exit(1)
	}

	testContentStore, err = NewContentStore("lfs-content-test")
	if err != nil {
		fmt.Printf("Error creating content store: %s", err)
		os.Exit(1)
	}

	if err := seedMetaStore(); err != nil {
		fmt.Printf("Error seeding meta store: %s", err)
		os.Exit(1)
	}

	if err := seedContentStore(); err != nil {
		fmt.Printf("Error seeding content store: %s", err)
		os.Exit(1)
	}

	app := NewApp(testContentStore, testMetaStore)
	lfsServer = httptest.NewServer(app)

	logger = NewKVLogger(ioutil.Discard)

	ret := m.Run()

	lfsServer.Close()
	testMetaStore.Close()
	os.Remove("lfs-test.db")
	os.RemoveAll("lfs-content-test")

	os.Exit(ret)
}

func seedMetaStore() error {
	if err := testMetaStore.AddUser(testUser, testPass); err != nil {
		return err
	}
	if err := testMetaStore.AddUser(testUser1, testPass1); err != nil {
		return err
	}

	rv := &RequestVars{Oid: contentOid, Size: contentSize}
	if _, err := testMetaStore.Put(rv); err != nil {
		return err
	}

	lock := NewTestLock(lockId, lockPath, testUser)
	if err := testMetaStore.AddLocks(testRepo, lock); err != nil {
		return err
	}

	return nil
}

func seedContentStore() error {
	meta := &MetaObject{Oid: contentOid, Size: contentSize}
	buf := bytes.NewBuffer([]byte(content))
	if err := testContentStore.Put(meta, buf); err != nil {
		return err
	}

	return nil
}
