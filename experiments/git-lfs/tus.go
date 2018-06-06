package main

import (
	"bufio"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type TusServer struct {
	serverMutex sync.Mutex
	tusProcess  *exec.Cmd
	dataPath    string
	tusBaseUrl  string
	httpClient  *http.Client
	oidToTusUrl map[string]string
}

var (
	tusServer *TusServer = &TusServer{}
)

// Start launches the tus server & stores uploads in the given contentPath
func (t *TusServer) Start() {
	t.serverMutex.Lock()
	defer t.serverMutex.Unlock()

	if t.tusProcess != nil {
		return
	}

	t.dataPath = filepath.Join(os.TempDir(), "lfs_tusserver")
	hostparts := strings.Split(Config.TusHost, ":")
	host := "localhost"
	port := "1080"
	if len(hostparts) > 0 {
		host = hostparts[0]
	}
	if len(hostparts) > 1 {
		port = hostparts[1]
	}
	t.tusProcess = exec.Command("tusd",
		"-dir", t.dataPath,
		"-host", host,
		"-port", port)
	// Make sure tus server is started before continuing
	var procWait sync.WaitGroup
	procWait.Add(1)
	go func(p *exec.Cmd) {

		stdout, err := p.StdoutPipe()
		if err != nil {
			panic(fmt.Sprintf("Error getting tus server stdout: %v", err))
		}
		stderr, err := p.StderrPipe()
		if err != nil {
			panic(fmt.Sprintf("Error getting tus server stderr: %v", err))
		}
		err = p.Start()
		if err != nil {
			panic(fmt.Sprintf("Error starting tus server: %v", err))
		}
		go func() {
			scanner := bufio.NewScanner(stdout)
			for scanner.Scan() {
				logger.Log(kv{"fn": "tusout", "msg": scanner.Text()})
			}
		}()
		go func() {
			scanner := bufio.NewScanner(stderr)
			for scanner.Scan() {
				logger.Log(kv{"fn": "tuserr", "msg": scanner.Text()})
			}
		}()
		time.Sleep(2)
		procWait.Done()
		defer p.Wait()

	}(t.tusProcess)
	procWait.Wait()
	logger.Log(kv{"fn": "Start", "msg": "Tus server started"})
	t.tusBaseUrl = fmt.Sprintf("http://%s:%s/files/", host, port)
	t.httpClient = &http.Client{}
	t.oidToTusUrl = make(map[string]string)
}

func (t *TusServer) Stop() {
	t.serverMutex.Lock()
	defer t.serverMutex.Unlock()
	if t.tusProcess != nil {
		t.tusProcess.Process.Kill()
		t.tusProcess = nil
	}
	logger.Log(kv{"fn": "Stop", "msg": "Tus server stopped"})
}

// Create a new upload URL for the given object
// Required to call CREATE on the tus API before uploading but not part of LFS API
func (t *TusServer) Create(oid string, size int64) (string, error) {
	t.serverMutex.Lock()
	defer t.serverMutex.Unlock()
	req, err := http.NewRequest("POST", t.tusBaseUrl, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Tus-Resumable", "1.0.0")
	req.Header.Set("Upload-Length", fmt.Sprintf("%d", size))
	req.Header.Set("Upload-Metadata", fmt.Sprintf("oid %s", oid))

	res, err := t.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	if res.StatusCode != 201 {
		return "", fmt.Errorf("Expected tus status code 201, got %d", res.StatusCode)
	}
	loc := res.Header.Get("Location")
	if len(loc) == 0 {
		return "", fmt.Errorf("Missing Location header in tus response")
	}
	t.oidToTusUrl[oid] = loc
	return loc, nil
}

// Move the finished uploaded data from TUS to the content store (called by verify)
func (t *TusServer) Finish(oid string, store *ContentStore) error {
	t.serverMutex.Lock()
	defer t.serverMutex.Unlock()

	loc, ok := t.oidToTusUrl[oid]
	if !ok {
		return fmt.Errorf("Unable to find upload for %s", oid)
	}
	parts := strings.Split(loc, "/")
	filename := filepath.Join(t.dataPath, fmt.Sprintf("%s.bin", parts[len(parts)-1]))
	stat, err := os.Stat(filename)
	if err != nil {
		return err
	}
	meta := &MetaObject{Oid: oid, Size: stat.Size(), Existing: false}
	f, err := os.Open(filename)
	if err != nil {
		return err
	}
	defer f.Close()
	err = store.Put(meta, f)
	if err == nil {
		os.Remove(filename)
		// tus also stores a .info file, remove that
		os.Remove(filepath.Join(t.dataPath, fmt.Sprintf("%s.info", parts[len(parts)-1])))
	}
	return err
}
