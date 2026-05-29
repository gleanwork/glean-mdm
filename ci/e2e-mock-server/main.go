// Command e2e-mock-server is a test helper that serves a version manifest and a
// downloadable binary for the self-update E2E test. It replaces the original
// Bun-based mock server.
package main

import (
	"crypto/sha256"
	"encoding/json"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
)

func main() {
	binaryPath := flag.String("binary-path", "", "Path to the binary to serve")
	portFile := flag.String("port-file", "", "File to write the version server port to")
	binaryPortFile := flag.String("binary-port-file", "", "File to write the binary server port to")
	versionStr := flag.String("version", "99.0.0", "Version to report")
	flag.Parse()

	if *binaryPath == "" || *portFile == "" || *binaryPortFile == "" {
		fmt.Fprintln(os.Stderr, "Usage: e2e-mock-server --binary-path <path> --port-file <path> --binary-port-file <path> [--version <ver>]")
		os.Exit(1)
	}

	binaryData, err := os.ReadFile(*binaryPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to read binary: %v\n", err)
		os.Exit(1)
	}
	checksum := fmt.Sprintf("sha256:%x", sha256.Sum256(binaryData))

	fmt.Printf("Binary: %s (%d bytes)\n", *binaryPath, len(binaryData))
	fmt.Printf("Checksum: %s\n", checksum)
	fmt.Printf("Version: %s\n", *versionStr)

	versionMux := http.NewServeMux()
	versionMux.HandleFunc("/api/v1/mdm/version", func(w http.ResponseWriter, r *http.Request) {
		fmt.Printf("[version] %s %s\n", r.Method, r.URL.Path)
		targets := []string{"darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "windows-x64"}
		checksums := map[string]string{}
		for _, t := range targets {
			checksums[t] = checksum
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"checksums": checksums, "version": *versionStr})
	})

	binaryMux := http.NewServeMux()
	binaryMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Printf("[binary] %s %s\n", r.Method, r.URL.Path)
		if strings.HasPrefix(r.URL.Path, "/static/mdm/binaries/") {
			w.Header().Set("Content-Type", "application/octet-stream")
			_, _ = w.Write(binaryData)
			return
		}
		http.Error(w, "Not Found", http.StatusNotFound)
	})

	versionPort := serve(versionMux)
	binaryPort := serve(binaryMux)

	fmt.Printf("Version server listening on port %d\n", versionPort)
	fmt.Printf("Binary server listening on port %d\n", binaryPort)
	writePort(*portFile, versionPort)
	writePort(*binaryPortFile, binaryPort)

	select {} // block until killed
}

func serve(handler http.Handler) int {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fmt.Fprintf(os.Stderr, "listen failed: %v\n", err)
		os.Exit(1)
	}
	go func() { _ = http.Serve(ln, handler) }()
	return ln.Addr().(*net.TCPAddr).Port
}

func writePort(path string, port int) {
	if err := os.WriteFile(path, []byte(fmt.Sprintf("%d", port)), 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "failed to write port file: %v\n", err)
		os.Exit(1)
	}
}
