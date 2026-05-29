// Package users enumerates local user accounts and active login sessions across
// platforms, mirroring users.ts.
package users

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gleanwork/glean-mdm/internal/logger"
	"github.com/gleanwork/glean-mdm/internal/platform"
)

var (
	whitespaceRE   = regexp.MustCompile(`\s+`)
	nfsHomeDirRE   = regexp.MustCompile(`NFSHomeDirectory:\s*(.+)`)
	primaryGroupRE = regexp.MustCompile(`PrimaryGroupID:\s*(\d+)`)
)

// UserInfo describes a local user. UID/GID are nil on Windows.
type UserInfo struct {
	UID      *int
	GID      *int
	HomeDir  string
	Username string
}

func intPtr(v int) *int { return &v }

func getDarwinUsers() []UserInfo {
	out, err := exec.Command("dscl", ".", "-list", "/Users", "UniqueID").Output()
	if err != nil {
		return nil
	}
	var users []UserInfo
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		parts := whitespaceRE.Split(strings.TrimSpace(line), -1)
		if len(parts) < 2 {
			continue
		}
		username := parts[0]
		uid, convErr := strconv.Atoi(parts[1])
		if convErr != nil || uid < 500 {
			continue
		}

		homeOut, herr := exec.Command("dscl", ".", "-read", "/Users/"+username, "NFSHomeDirectory").Output()
		if herr != nil {
			continue
		}
		homeMatch := nfsHomeDirRE.FindStringSubmatch(string(homeOut))
		if homeMatch == nil {
			continue
		}
		homeDir := strings.TrimSpace(homeMatch[1])

		gid := uid
		gidOut, gerr := exec.Command("dscl", ".", "-read", "/Users/"+username, "PrimaryGroupID").Output()
		if gerr == nil {
			if gidMatch := primaryGroupRE.FindStringSubmatch(string(gidOut)); gidMatch != nil {
				if parsed, perr := strconv.Atoi(gidMatch[1]); perr == nil {
					gid = parsed
				}
			}
		}

		users = append(users, UserInfo{UID: intPtr(uid), GID: intPtr(gid), HomeDir: homeDir, Username: username})
	}
	return users
}

func getLinuxUsers() []UserInfo {
	out, err := exec.Command("getent", "passwd").Output()
	if err != nil {
		return nil
	}
	var users []UserInfo
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		parts := strings.Split(line, ":")
		if len(parts) < 7 {
			continue
		}
		username := parts[0]
		uid, uerr := strconv.Atoi(parts[2])
		gid, gerr := strconv.Atoi(parts[3])
		homeDir := parts[5]
		shell := parts[6]
		if uerr != nil || gerr != nil {
			continue
		}
		if uid < 1000 {
			continue
		}
		if strings.Contains(shell, "nologin") || strings.Contains(shell, "false") {
			continue
		}
		users = append(users, UserInfo{UID: intPtr(uid), GID: intPtr(gid), HomeDir: homeDir, Username: username})
	}
	return users
}

func getWindowsUsers() []UserInfo {
	usersDir := `C:\Users`
	exclude := map[string]bool{"Public": true, "Default": true, "Default User": true, "defaultuser0": true, "All Users": true}
	var users []UserInfo

	entries, err := os.ReadDir(usersDir)
	if err != nil {
		logger.Error("Failed to enumerate Windows users")
		return nil
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if exclude[entry.Name()] {
			continue
		}
		users = append(users, UserInfo{
			HomeDir:  filepath.Join(usersDir, entry.Name()),
			Username: entry.Name(),
		})
	}
	return users
}

// Enumerate returns all local users on the current platform.
func Enumerate() []UserInfo {
	switch platform.Get() {
	case platform.Darwin:
		return getDarwinUsers()
	case platform.Linux:
		return getLinuxUsers()
	case platform.Win32:
		return getWindowsUsers()
	}
	return nil
}

// Lookup returns the user with the given username, or nil if not found.
func Lookup(username string) *UserInfo {
	for _, u := range Enumerate() {
		if u.Username == username {
			user := u
			return &user
		}
	}
	return nil
}

// ActiveSessionUsers returns the set of usernames with active login sessions, or
// nil if it could not be determined (e.g. `who` failed). On Windows all users
// are considered active.
func ActiveSessionUsers() (map[string]bool, bool) {
	if platform.Get() == platform.Win32 {
		set := map[string]bool{}
		for _, u := range getWindowsUsers() {
			set[u.Username] = true
		}
		return set, true
	}

	cmd := exec.Command("who")
	out, err := runWithTimeout(cmd, 5*time.Second)
	if err != nil {
		return nil, false
	}
	set := map[string]bool{}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		fields := regexp.MustCompile(`\s+`).Split(strings.TrimSpace(line), -1)
		if len(fields) > 0 && fields[0] != "" {
			set[fields[0]] = true
		}
	}
	return set, true
}

func runWithTimeout(cmd *exec.Cmd, timeout time.Duration) ([]byte, error) {
	out := &strings.Builder{}
	cmd.Stdout = out
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		if err != nil {
			return nil, err
		}
		return []byte(out.String()), nil
	case <-time.After(timeout):
		_ = cmd.Process.Kill()
		<-done
		return nil, os.ErrDeadlineExceeded
	}
}
