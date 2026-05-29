// Package scheduler installs/removes the system scheduled task (launchd,
// systemd, or Task Scheduler), mirroring scheduler.ts.
package scheduler

import (
	cryptorand "crypto/rand"
	"fmt"
	"math/big"
	"os"
	"os/exec"

	"github.com/gleanwork/glean-mdm/internal/logger"
	"github.com/gleanwork/glean-mdm/internal/platform"
)

const (
	macOSPlistPath   = "/Library/LaunchDaemons/com.glean.mdm.plist"
	linuxServicePath = "/etc/systemd/system/glean-mdm.service"
	linuxTimerPath   = "/etc/systemd/system/glean-mdm.timer"
	windowsTaskName  = "Glean MDM"
)

// RandomMinute returns a random minute (0-59) to stagger scheduled runs.
func RandomMinute() int {
	n, err := cryptorand.Int(cryptorand.Reader, big.NewInt(60))
	if err != nil {
		return 0
	}
	return int(n.Int64())
}

// SchtasksCreateArgs builds the schtasks /Create arguments. The /TR value must
// quote paths with spaces for Task Scheduler.
func SchtasksCreateArgs(binaryPath string, minute int) []string {
	startTime := fmt.Sprintf("09:%02d", minute)
	return []string{"/Create", "/TN", windowsTaskName, "/TR", fmt.Sprintf("\"%s\" run", binaryPath), "/SC", "DAILY", "/ST", startTime, "/RU", "SYSTEM", "/F"}
}

// BuildMacOSPlist renders the LaunchDaemon plist.
func BuildMacOSPlist(binaryPath string, minute int) string {
	return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.glean.mdm</string>
    <key>ProgramArguments</key>
    <array>
        <string>%s</string>
        <string>run</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>%d</integer>
    </dict>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>`, binaryPath, minute)
}

func installMacOSSchedule() {
	binaryPath := platform.GetBinaryInstallPath()
	minute := RandomMinute()
	plist := BuildMacOSPlist(binaryPath, minute)

	if err := os.WriteFile(macOSPlistPath, []byte(plist), 0o644); err != nil {
		logger.Error("Failed to write LaunchDaemon plist: %v", err)
		return
	}
	_ = exec.Command("launchctl", "bootout", "system", macOSPlistPath).Run()
	if err := exec.Command("launchctl", "bootstrap", "system", macOSPlistPath).Run(); err != nil {
		logger.Error("Failed to bootstrap LaunchDaemon: %v", err)
		return
	}
	logger.Info("Installed macOS LaunchDaemon schedule (daily at 9:%02d AM)", minute)
}

func uninstallMacOSSchedule() {
	_, statErr := os.Stat(macOSPlistPath)
	existed := statErr == nil
	_ = exec.Command("launchctl", "bootout", "system", macOSPlistPath).Run()
	_ = os.Remove(macOSPlistPath)
	if existed {
		logger.Info("Removed macOS LaunchDaemon schedule")
	}
}

func installLinuxSchedule() {
	binaryPath := platform.GetBinaryInstallPath()

	service := fmt.Sprintf(`[Unit]
Description=Glean MDM
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=%s run

[Install]
WantedBy=multi-user.target
`, binaryPath)

	minute := RandomMinute()
	timer := fmt.Sprintf(`[Unit]
Description=Daily Glean MDM

[Timer]
OnCalendar=*-*-* 09:%02d:00
Persistent=true

[Install]
WantedBy=timers.target
`, minute)

	if err := os.WriteFile(linuxServicePath, []byte(service), 0o644); err != nil {
		logger.Error("Failed to write systemd service: %v", err)
		return
	}
	if err := os.WriteFile(linuxTimerPath, []byte(timer), 0o644); err != nil {
		logger.Error("Failed to write systemd timer: %v", err)
		return
	}
	_ = exec.Command("systemctl", "daemon-reload").Run()
	if err := exec.Command("systemctl", "enable", "--now", "glean-mdm.timer").Run(); err != nil {
		logger.Error("Failed to enable systemd timer: %v", err)
		return
	}
	logger.Info("Installed systemd timer schedule (daily at 9:%02d AM)", minute)
}

func uninstallLinuxSchedule() {
	_, serviceErr := os.Stat(linuxServicePath)
	_, timerErr := os.Stat(linuxTimerPath)
	existed := serviceErr == nil || timerErr == nil

	_ = exec.Command("systemctl", "disable", "--now", "glean-mdm.timer").Run()
	_ = os.Remove(linuxServicePath)
	_ = os.Remove(linuxTimerPath)
	_ = exec.Command("systemctl", "daemon-reload").Run()
	if existed {
		logger.Info("Removed systemd timer schedule")
	}
}

func installWindowsSchedule() {
	binaryPath := platform.GetBinaryInstallPath()
	minute := RandomMinute()
	if err := exec.Command("schtasks", SchtasksCreateArgs(binaryPath, minute)...).Run(); err != nil {
		logger.Error("Failed to create Windows scheduled task: %v", err)
		return
	}
	// Enable catch-up: run the task if a scheduled run was missed while the machine was off.
	script := fmt.Sprintf(`$t = Get-ScheduledTask '%s'; $t.Settings.StartWhenAvailable = $true; $t | Set-ScheduledTask`, windowsTaskName)
	_ = exec.Command("powershell", "-Command", script).Run()
	logger.Info("Installed Windows Task Scheduler schedule (daily at 9:%02d AM)", minute)
}

func uninstallWindowsSchedule() {
	if err := exec.Command("schtasks", "/Delete", "/TN", windowsTaskName, "/F").Run(); err != nil {
		logger.Error("Failed to uninstall Windows schedule: %v", err)
		return
	}
	logger.Info("Removed Windows Task Scheduler schedule")
}

// Install installs the scheduled task for the current platform.
func Install() {
	switch platform.Get() {
	case platform.Darwin:
		installMacOSSchedule()
	case platform.Linux:
		installLinuxSchedule()
	case platform.Win32:
		installWindowsSchedule()
	}
}

// Uninstall removes the scheduled task for the current platform.
func Uninstall() {
	switch platform.Get() {
	case platform.Darwin:
		uninstallMacOSSchedule()
	case platform.Linux:
		uninstallLinuxSchedule()
	case platform.Win32:
		uninstallWindowsSchedule()
	}
}
