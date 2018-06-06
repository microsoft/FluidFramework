package main

import (
	"fmt"
	"io"
	"os"
	"path"
	"runtime"
	"strings"
	"sync"
	"time"
)

var (
	pid      int
	hostname string
)

func init() {
	pid = os.Getpid()
	h, err := os.Hostname()
	if err != nil {
		hostname = "localhost"
	} else {
		hostname = h
	}
}

type kv map[string]interface{}

// KVLogger provides a logger that logs data in key/value pairs.
type KVLogger struct {
	w  io.Writer
	mu sync.Mutex
}

// NewKVLogger creates a KVLogger that writes to `out`.
func NewKVLogger(out io.Writer) *KVLogger {
	return &KVLogger{w: out}
}

// Log logs the key/value pairs to the logger's output.
func (l *KVLogger) Log(data kv) {
	var file string
	var line int
	var ok bool

	_, file, line, ok = runtime.Caller(2)
	if ok {
		file = path.Base(file)
	} else {
		file = "???"
		line = 0
	}

	out := fmt.Sprintf("%s %s lfs[%d] [%s:%d]: ", time.Now().UTC().Format(time.RFC3339), hostname, pid, file, line)
	var vals []string

	for k, v := range data {
		vals = append(vals, fmt.Sprintf("%s=%v", k, v))
	}
	out += strings.Join(vals, " ")

	l.mu.Lock()
	fmt.Fprint(l.w, out+"\n")
	l.mu.Unlock()
}

// Fatal is equivalent to Log() follwed by a call to os.Exit(1)
func (l *KVLogger) Fatal(data kv) {
	l.Log(data)
	os.Exit(1)
}
