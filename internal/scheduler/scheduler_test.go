package scheduler

import (
	"strings"
	"testing"
)

func TestSchtasksCreateArgs(t *testing.T) {
	args := SchtasksCreateArgs(`C:\Program Files\Glean\glean-mdm.exe`, 7)
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "/Create") || !strings.Contains(joined, "Glean MDM") {
		t.Errorf("missing expected args: %v", args)
	}
	// /TR must quote the binary path and append run.
	found := false
	for _, a := range args {
		if a == `"C:\Program Files\Glean\glean-mdm.exe" run` {
			found = true
		}
	}
	if !found {
		t.Errorf("/TR value not correctly quoted: %v", args)
	}
	// Start time should be zero-padded.
	foundTime := false
	for _, a := range args {
		if a == "09:07" {
			foundTime = true
		}
	}
	if !foundTime {
		t.Errorf("start time not zero-padded: %v", args)
	}
}

func TestBuildMacOSPlist(t *testing.T) {
	plist := BuildMacOSPlist("/usr/local/bin/glean-mdm", 5)
	if !strings.Contains(plist, "<string>/usr/local/bin/glean-mdm</string>") {
		t.Error("plist missing binary path")
	}
	if !strings.Contains(plist, "<integer>5</integer>") {
		t.Error("plist missing minute")
	}
	if !strings.Contains(plist, "com.glean.mdm") {
		t.Error("plist missing label")
	}
}

func TestRandomMinuteRange(t *testing.T) {
	for i := 0; i < 200; i++ {
		m := RandomMinute()
		if m < 0 || m > 59 {
			t.Fatalf("RandomMinute out of range: %d", m)
		}
	}
}
