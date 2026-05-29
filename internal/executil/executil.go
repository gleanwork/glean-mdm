// Package executil runs external commands with a timeout, killing the process
// if it does not finish in time.
package executil

import (
	"errors"
	"os/exec"
	"time"
)

// ErrTimeout is returned by RunWithTimeout when the command is killed for
// exceeding its deadline.
var ErrTimeout = errors.New("command timed out")

// RunWithTimeout starts cmd and waits up to timeout for it to finish. Configure
// cmd.Stdout/Stderr before calling if you need to capture output. On timeout the
// process is killed and ErrTimeout is returned.
func RunWithTimeout(cmd *exec.Cmd, timeout time.Duration) error {
	if err := cmd.Start(); err != nil {
		return err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		return err
	case <-time.After(timeout):
		_ = cmd.Process.Kill()
		<-done
		return ErrTimeout
	}
}
