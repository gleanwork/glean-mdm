// Package fsutil provides small filesystem helpers shared across packages:
// resolving symlinks to their target and writing files atomically.
package fsutil

import (
	"os"
	"path/filepath"
)

// ResolveWritePath returns the symlink target of path (so writes land on the
// real file), or path unchanged if it is not a symlink or cannot be resolved.
func ResolveWritePath(path string) string {
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		return resolved
	}
	return path
}

// AtomicWrite writes data to path atomically: it resolves any symlink, creates
// the parent directory, writes to a sibling .tmp file, then renames it into
// place.
func AtomicWrite(path string, data []byte) error {
	writePath := ResolveWritePath(path)
	if err := os.MkdirAll(filepath.Dir(writePath), 0o755); err != nil {
		return err
	}
	tmp := writePath + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, writePath)
}
