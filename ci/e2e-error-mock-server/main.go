// Command e2e-error-mock-server is a test helper that simulates version/binary
// endpoint failures for the self-update error-handling E2E test. It replaces
// the original Bun-based mock server.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/gleanwork/glean-mdm/ci/mockutil"
)

func main() {
	portFile := flag.String("port-file", "", "File to write the version server port to")
	binaryPortFile := flag.String("binary-port-file", "", "File to write the binary server port to")
	versionStatus := flag.Int("version-status", 200, "HTTP status for the version endpoint")
	binaryStatus := flag.Int("binary-status", 200, "HTTP status for the binary endpoint")
	flag.Parse()

	if *portFile == "" || *binaryPortFile == "" {
		fmt.Fprintln(os.Stderr, "Usage: e2e-error-mock-server --port-file <path> --binary-port-file <path> [--version-status <code>] [--binary-status <code>]")
		os.Exit(1)
	}

	fmt.Printf("Version endpoint status: %d\n", *versionStatus)
	fmt.Printf("Binary endpoint status: %d\n", *binaryStatus)

	versionMux := http.NewServeMux()
	versionMux.HandleFunc("/api/v1/mdm/version", func(w http.ResponseWriter, r *http.Request) {
		fmt.Printf("[version] %s %s\n", r.Method, r.URL.Path)
		if *versionStatus != 200 {
			http.Error(w, "Simulated error", *versionStatus)
			return
		}
		targets := []string{"darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "windows-x64"}
		checksums := map[string]string{}
		for _, t := range targets {
			checksums[t] = "sha256:0000000000000000000000000000000000000000000000000000000000000000"
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"checksums": checksums, "version": "99.0.0"})
	})

	binaryMux := http.NewServeMux()
	binaryMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Printf("[binary] %s %s\n", r.Method, r.URL.Path)
		if strings.HasPrefix(r.URL.Path, "/static/mdm/binaries/") {
			if *binaryStatus != 200 {
				http.Error(w, "Simulated error", *binaryStatus)
				return
			}
			w.Header().Set("Content-Type", "application/octet-stream")
			_, _ = w.Write([]byte("dummy-binary-data"))
			return
		}
		http.Error(w, "Not Found", http.StatusNotFound)
	})

	versionPort := mockutil.Serve(versionMux)
	binaryPort := mockutil.Serve(binaryMux)

	fmt.Printf("Version server listening on port %d\n", versionPort)
	fmt.Printf("Binary server listening on port %d\n", binaryPort)
	mockutil.WritePort(*portFile, versionPort)
	mockutil.WritePort(*binaryPortFile, binaryPort)

	select {}
}
