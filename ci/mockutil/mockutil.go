// Package mockutil holds helpers shared by the e2e mock server programs:
// binding an ephemeral localhost port and recording it to a port file.
package mockutil

import (
	"fmt"
	"net"
	"net/http"
	"os"
)

// Serve binds handler to an ephemeral localhost port and serves it in the
// background, returning the chosen port. It exits the process on bind failure.
func Serve(handler http.Handler) int {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fmt.Fprintf(os.Stderr, "listen failed: %v\n", err)
		os.Exit(1)
	}
	go func() { _ = http.Serve(ln, handler) }()
	return ln.Addr().(*net.TCPAddr).Port
}

// WritePort writes port to path so the e2e driver can discover it. It exits the
// process on write failure.
func WritePort(path string, port int) {
	if err := os.WriteFile(path, []byte(fmt.Sprintf("%d", port)), 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "failed to write port file: %v\n", err)
		os.Exit(1)
	}
}
