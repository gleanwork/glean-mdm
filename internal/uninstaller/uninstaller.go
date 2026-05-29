// Package uninstaller performs a full uninstall (schedule, binary, config, logs),
// mirroring uninstaller.ts.
package uninstaller

import (
	"os"

	"github.com/gleanwork/glean-mdm/internal/logger"
	"github.com/gleanwork/glean-mdm/internal/platform"
	"github.com/gleanwork/glean-mdm/internal/scheduler"
)

// Options controls uninstall behavior.
type Options struct {
	KeepConfig bool
}

// FullUninstall removes the schedule, binary, config directory, and log file.
func FullUninstall(opts Options) {
	scheduler.Uninstall()

	binaryPath := platform.GetBinaryInstallPath()
	if platform.Get() == platform.Win32 {
		// Windows locks running executables: rename first (works on locked
		// files), then best-effort delete — same approach as the updater.
		oldPath := binaryPath + ".old"
		if err := os.Rename(binaryPath, oldPath); err == nil {
			logger.Info("Renamed binary to %s", oldPath)
			if rerr := os.Remove(oldPath); rerr == nil {
				logger.Info("Removed binary: %s", oldPath)
			} else {
				logger.Warn("Could not remove %s (locked) — it will be cleaned up on next boot or update", oldPath)
			}
		} else {
			logger.Warn("Could not remove binary: %s", binaryPath)
		}
	} else {
		if err := os.Remove(binaryPath); err == nil {
			logger.Info("Removed binary: %s", binaryPath)
		} else {
			logger.Warn("Could not remove binary: %s", binaryPath)
		}
	}

	logger.Info("Uninstall complete")

	// Remove config dir and log file last so earlier steps can still write to
	// the log. On Windows the log file lives inside the config dir.
	configDir := platform.GetDefaultConfigDir()
	if opts.KeepConfig {
		logger.Info("Keeping config directory: %s", configDir)
	} else {
		_ = os.RemoveAll(configDir)
	}
	_ = os.Remove(platform.GetLogFilePath())
}
