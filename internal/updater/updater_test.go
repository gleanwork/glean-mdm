package updater

import "testing"

func TestCompareVersions(t *testing.T) {
	cases := []struct {
		a, b string
		want int // sign
	}{
		{"1.0.0", "1.0.0", 0},
		{"2.3.4", "2.3.4", 0},
		{"2.0.0", "1.0.0", 1},
		{"1.1.0", "1.0.0", 1},
		{"1.0.1", "1.0.0", 1},
		{"1.0.0", "2.0.0", -1},
		{"1.0.0", "1.1.0", -1},
		{"1.0.0", "1.0.1", -1},
		{"v1.2.3", "1.2.3", 0},
		{"v2.0.0", "v1.0.0", 1},
		{"1.0", "1.0.0", 0},
		{"1.0.0", "1.0", 0},
		{"1.0.1", "1.0", 1},
		{"1.0", "1.0.1", -1},
		{"2.0.0", "1.9.9", 1},
		{"10.0.0", "9.9.9", 1},
	}
	for _, c := range cases {
		got := CompareVersions(c.a, c.b)
		if sign(got) != c.want {
			t.Errorf("CompareVersions(%q, %q) = %d, want sign %d", c.a, c.b, got, c.want)
		}
	}
}

func TestShouldUpdate(t *testing.T) {
	cases := []struct {
		current, server, pinned string
		want                    bool
	}{
		{"1.0.0", "1.0.0", "", false},
		{"1.0.0", "2.0.0", "", true},
		{"2.0.0", "1.0.0", "", true},
		{"1.2.3", "2.0.0", "1.2.3", false},
		{"1.0.0", "2.0.0", "1.2.3", true},
		{"2.0.0", "2.0.0", "1.2.3", true},
		{"3.0.0", "2.0.0", "1.2.3", true},
		{"1.2.3", "2.0.0", "v1.2.3", false},
		{"1.2.3", "3.0.0", "1.2.3", false},
		{"1.0.0", "3.0.0", "1.2.3", true},
	}
	for _, c := range cases {
		if got := ShouldUpdate(c.current, c.server, c.pinned); got != c.want {
			t.Errorf("ShouldUpdate(%q,%q,%q) = %v, want %v", c.current, c.server, c.pinned, got, c.want)
		}
	}
}

func TestGetBinaryURL(t *testing.T) {
	if got := getBinaryURL("https://x/prefix", "darwin-arm64", "1.2.3"); got != "https://x/prefix/1.2.3/glean-mdm-darwin-arm64" {
		t.Errorf("unexpected unix url: %s", got)
	}
	if got := getBinaryURL("https://x/prefix", "windows-x64", "1.2.3"); got != "https://x/prefix/1.2.3/glean-mdm-windows-x64.exe" {
		t.Errorf("unexpected windows url: %s", got)
	}
}

func sign(n int) int {
	switch {
	case n > 0:
		return 1
	case n < 0:
		return -1
	default:
		return 0
	}
}
