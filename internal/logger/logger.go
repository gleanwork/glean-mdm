// Package logger provides structured stdout + file logging with size-based
// truncation, mirroring the original logger.ts behavior.
package logger

import (
	"fmt"
	"os"
	"time"

	"github.com/gleanwork/glean-mdm/internal/platform"
)

const maxLogSize = 10 * 1024 * 1024 // 10MB

var logFilePath string

// Init sets the log file path (defaulting to the platform path) and truncates
// it if it exceeds the size limit. Pass an explicit path in tests.
func Init(path string) {
	if path == "" {
		path = platform.GetLogFilePath()
	}
	logFilePath = path

	if info, err := os.Stat(logFilePath); err == nil {
		if info.Size() > maxLogSize {
			_ = os.WriteFile(logFilePath, []byte{}, 0o644)
		}
	}
}

func write(level, message string) {
	timestamp := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	line := fmt.Sprintf("[%s] [%s] %s\n", timestamp, level, message)
	_, _ = os.Stdout.WriteString(line)
	if logFilePath != "" {
		if f, err := os.OpenFile(logFilePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644); err == nil {
			_, _ = f.WriteString(line)
			_ = f.Close()
		}
	}
}

// Info logs at INFO level.
func Info(format string, args ...any) { write("INFO", sprintf(format, args...)) }

// Warn logs at WARN level.
func Warn(format string, args ...any) { write("WARN", sprintf(format, args...)) }

// Error logs at ERROR level.
func Error(format string, args ...any) { write("ERROR", sprintf(format, args...)) }

func sprintf(format string, args ...any) string {
	if len(args) == 0 {
		return format
	}
	return fmt.Sprintf(format, args...)
}
