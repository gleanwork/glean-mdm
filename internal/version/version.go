// Package version exposes the build version, injected at link time.
package version

// BuildVersion is set via -ldflags "-X .../internal/version.BuildVersion=<ver>".
var BuildVersion = "0.0.0-dev"
