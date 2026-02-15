# Firefox Alternatives & Build-from-Source Guide

**Date:** 2026-02-15  
**Purpose:** Comprehensive guide to building Firefox from source, alternative browsers, and DNS-level telemetry blocking

---

## 🔨 **Part 1: Building Firefox from Source to Override Locked Preferences**

### **Why Build from Source?**
- **Full control** over compile-time flags and patches
- **Remove telemetry** completely (not just disable)
- **Unlock preferences** that distributions lock
- **Custom optimizations** for your hardware

### **Prerequisites:**

```bash
# Disk space: ~40GB for source + build artifacts
# RAM: 8GB minimum, 16GB recommended
# Time: 1-3 hours depending on CPU

# Install build dependencies (Arch Linux):
sudo pacman -S --needed base-devel python mercurial git \
    autoconf2.13 unzip zip yasm nasm mesa libpulse \
    gtk3 dbus-glib cbindgen nodejs clang llvm lld \
    rust cargo

# For Debian/Ubuntu:
sudo apt install build-essential python3 mercurial git \
    autoconf2.13 unzip zip yasm nasm libgtk-3-dev \
    libdbus-glib-1-dev libpulse-dev nodejs cargo rustc \
    clang llvm lld cbindgen
```

### **Step 1: Clone Firefox Source**

```bash
# Create workspace
mkdir ~/firefox-build && cd ~/firefox-build

# Clone Mozilla's Mercurial repository (official method)
hg clone https://hg.mozilla.org/mozilla-central/

# OR use Git mirror (faster, but unofficial)
git clone https://github.com/mozilla/gecko-dev.git mozilla-central

cd mozilla-central
```

### **Step 2: Create Custom Build Configuration**

```bash
# Create mozconfig file (build configuration)
cat > mozconfig << 'EOF'
# Build Firefox for release (optimized)
ac_add_options --enable-application=browser
ac_add_options --enable-optimize
ac_add_options --disable-debug

# DISABLE TELEMETRY COMPLETELY
ac_add_options --disable-telemetry-reporting
ac_add_options --disable-crashreporter
ac_add_options --disable-updater

# Enable privacy features
ac_add_options --enable-privacy

# Use system libraries (faster build, smaller binary)
ac_add_options --with-system-zlib
ac_add_options --with-system-bz2

# Use Clang/LLVM for better optimization
export CC=clang
export CXX=clang++
export AR=llvm-ar
export NM=llvm-nm
export RANLIB=llvm-ranlib

# Optimize for your CPU (replace 'native' with specific arch if cross-compiling)
export CFLAGS="-march=native -O3"
export CXXFLAGS="-march=native -O3"

# Use LLD linker (faster than GNU ld)
ac_add_options --enable-linker=lld

# Parallel build (adjust -j based on CPU cores)
mk_add_options MOZ_MAKE_FLAGS="-j$(nproc)"
EOF
```

### **Step 3: Patch Source Code to Unlock Preferences**

```bash
# Edit the telemetry locking code
nano modules/libpref/Preferences.cpp

# Find lines 3722-3780 (search for "kTelemetryPref")
# BEFORE:
#   if (IsNightly() || IsBeta()) {
#     Preferences::Lock(kTelemetryPref, true);
#   }

# AFTER (comment out the locking):
#   // CUSTOM BUILD: Allow user.js to override telemetry
#   // if (IsNightly() || IsBeta()) {
#   //   Preferences::Lock(kTelemetryPref, true);
#   // }

# Save and exit (Ctrl+O, Ctrl+X)
```

### **Step 4: Build Firefox**

```bash
# Bootstrap the build system (first time only)
./mach bootstrap

# Build Firefox (this takes 1-3 hours)
./mach build

# The build will output to: obj-x86_64-pc-linux-gnu/dist/bin/
```

### **Step 5: Run Your Custom Firefox**

```bash
# Run directly from build directory
./mach run

# OR create a distributable package
./mach package

# Package will be in: obj-x86_64-pc-linux-gnu/dist/
# Install it system-wide or run from ~/firefox-build/
```

### **Step 6: Verify Telemetry is Unlocked**

```bash
# Start your custom Firefox
./mach run

# In Firefox:
# 1. Navigate to: about:config
# 2. Search: toolkit.telemetry.enabled
# 3. You should be able to toggle it (no padlock icon)
# 4. Set it to: false
# 5. Restart Firefox
```

### **Maintenance:**

```bash
# Update source code
cd ~/firefox-build/mozilla-central
hg pull && hg update  # For Mercurial
# OR
git pull  # For Git mirror

# Rebuild
./mach build

# Clean build (if errors occur)
./mach clobber
./mach build
```

---

## 🦊 **Part 2: Firefox-Based Alternatives (Pre-Built, Privacy-Focused)**

### **Comparison Table:**

| Browser | Engine | Telemetry | User.js Support | Extensions | Recommended? |
|---------|--------|-----------|-----------------|------------|--------------|
| **LibreWolf** | Gecko (Firefox) | ❌ Removed | ✅ Full | ✅ Full | ✅ **BEST** |
| **Waterfox** | Gecko (Firefox) | ❌ Disabled | ✅ Full | ✅ Full | ✅ Good |
| **Pale Moon** | Goanna (fork) | ❌ None | ⚠️ Limited | ⚠️ Limited | ⚠️ Niche |
| **Basilisk** | Goanna (fork) | ❌ None | ⚠️ Limited | ⚠️ Limited | ⚠️ Niche |
| **GNU IceCat** | Gecko (Firefox) | ❌ Removed | ✅ Full | ✅ Full | ✅ Good |
| **Tor Browser** | Gecko (Firefox) | ❌ Disabled | ⚠️ Don't modify | ✅ Limited | ⚠️ Specific use |

---

### **1. LibreWolf (RECOMMENDED)**

**What it is:** Firefox fork with privacy hardening and telemetry removal

**Advantages:**
- ✅ **Zero telemetry** (completely removed from source)
- ✅ **uBlock Origin** pre-installed
- ✅ **All Firefox extensions** work
- ✅ **Regular updates** (tracks Firefox releases)
- ✅ **user.js fully supported**
- ✅ **Available in most package managers**

**Installation:**
```bash
# Arch Linux
sudo pacman -S librewolf

# Debian/Ubuntu (via PPA)
sudo add-apt-repository ppa:librewolf-community/librewolf
sudo apt update && sudo apt install librewolf

# Flatpak (universal)
flatpak install flathub io.gitlab.librewolf-community

# From source
git clone https://gitlab.com/librewolf-community/browser/source.git
cd source
./build.sh
```

**Default Privacy Settings:**
- ✅ Telemetry removed
- ✅ Pocket removed
- ✅ WebRTC leak protection
- ✅ Fingerprinting resistance
- ✅ HTTPS-only mode
- ✅ No Google Safe Browsing (uses local lists)

**Compatibility:** 100% compatible with Firefox extensions and user.js

---

### **2. Waterfox**

**What it is:** Firefox fork focused on privacy and classic UI

**Advantages:**
- ✅ **No telemetry**
- ✅ **All Firefox extensions** work
- ✅ **Classic Firefox UI** option (pre-Quantum)
- ✅ **user.js fully supported**

**Installation:**
```bash
# Arch Linux (AUR)
yay -S waterfox-bin

# Flatpak
flatpak install flathub net.waterfox.waterfox

# Download from: https://www.waterfox.net/
```

**Variants:**
- **Waterfox G6** (current, based on Firefox ESR)
- **Waterfox Classic** (legacy, based on Firefox 56)

---

### **3. GNU IceCat**

**What it is:** GNU's version of Firefox with freedom and privacy focus

**Advantages:**
- ✅ **100% free software** (no proprietary blobs)
- ✅ **No telemetry**
- ✅ **Privacy extensions** pre-installed
- ✅ **LibreJS** for JavaScript freedom

**Disadvantages:**
- ❌ **Slow update cycle** (often 6-12 months behind Firefox)
- ❌ **Not in most package managers**

**Installation:**
```bash
# Download from: https://www.gnu.org/software/gnuzilla/
# Build from source (recommended)
```

---

### **4. Pale Moon**

**What it is:** Independent browser using Goanna engine (Firefox 29 fork)

**Advantages:**
- ✅ **No telemetry**
- ✅ **Classic UI** (pre-Australis)
- ✅ **Lightweight**
- ✅ **Independent development**

**Disadvantages:**
- ❌ **Limited extension support** (only XUL extensions)
- ❌ **Older rendering engine** (some modern sites break)
- ❌ **Small development team**

**Installation:**
```bash
# Arch Linux (AUR)
yay -S palemoon-bin

# Download from: https://www.palemoon.org/
```

**Use case:** Older hardware, classic UI preference, or sites that work better with older engines

---

## 🌐 **Part 3: Block Telemetry at DNS Level**

### **Why DNS-Level Blocking?**
- ✅ **Works regardless of browser settings**
- ✅ **Blocks telemetry from ALL applications** (not just Firefox)
- ✅ **No performance impact**
- ✅ **Survives browser updates**
- ✅ **Can't be bypassed by malware/extensions**

### **Method 1: /etc/hosts File (Simplest)**

```bash
# Edit hosts file
sudo nano /etc/hosts

# Add these lines at the end:
127.0.0.1 incoming.telemetry.mozilla.org
127.0.0.1 telemetry.mozilla.org
127.0.0.1 telemetry-incoming.r53-2.services.mozilla.com
127.0.0.1 telemetry-experiment.cdn.mozilla.net
127.0.0.1 normandy.cdn.mozilla.net
127.0.0.1 normandy-cdn.services.mozilla.com
127.0.0.1 tiles.services.mozilla.com
127.0.0.1 tiles-cloudfront.cdn.mozilla.net
127.0.0.1 snippets.cdn.mozilla.net
127.0.0.1 snippets.mozilla.com
127.0.0.1 location.services.mozilla.com
127.0.0.1 push.services.mozilla.com
127.0.0.1 tracking-protection.cdn.mozilla.net
127.0.0.1 firefox.settings.services.mozilla.com
127.0.0.1 shavar.services.mozilla.com
127.0.0.1 content-signature-2.cdn.mozilla.net

# Save and exit (Ctrl+O, Ctrl+X)

# Flush DNS cache
sudo systemd-resolve --flush-caches  # systemd-resolved
# OR
sudo resolvectl flush-caches  # newer systemd
# OR
sudo killall -HUP mDNSResponder  # macOS
```

**Advantages:**
- ✅ No additional software needed
- ✅ Works immediately
- ✅ Survives reboots

**Disadvantages:**
- ❌ Manual updates needed
- ❌ Only blocks exact domain matches (not wildcards)

---

### **Method 2: Pi-hole (Network-Wide Blocking)**

**What it is:** Network-level DNS blocker (blocks ads + telemetry for ALL devices)

**Installation:**
```bash
# One-line installer
curl -sSL https://install.pi-hole.net | bash

# OR manual installation
git clone --depth 1 https://github.com/pi-hole/pi-hole.git Pi-hole
cd Pi-hole/automated\ install/
sudo bash basic-install.sh
```

**Add Mozilla Telemetry Blocklist:**
```bash
# Access Pi-hole admin panel: http://pi.hole/admin

# Go to: Group Management → Adlists
# Add this URL:
https://raw.githubusercontent.com/hagezi/dns-blocklists/main/domains/native.mozilla.txt

# Update gravity (apply blocklist)
pihole -g
```

**Advantages:**
- ✅ **Blocks telemetry for ALL devices** on your network
- ✅ **Automatic updates** of blocklists
- ✅ **Web UI** for management
- ✅ **Detailed statistics**
- ✅ **Wildcard support**

**Disadvantages:**
- ❌ Requires dedicated device (Raspberry Pi, old PC, or VM)
- ❌ More complex setup

---

### **Method 3: Unbound DNS with Blocklists**

**What it is:** Local recursive DNS resolver with blocking

**Installation:**
```bash
# Install Unbound
sudo pacman -S unbound  # Arch
sudo apt install unbound  # Debian/Ubuntu

# Create blocklist
sudo nano /etc/unbound/unbound.conf.d/mozilla-block.conf
```

**Configuration:**
```conf
server:
    # Block Mozilla telemetry domains
    local-zone: "incoming.telemetry.mozilla.org" always_nxdomain
    local-zone: "telemetry.mozilla.org" always_nxdomain
    local-zone: "telemetry-incoming.r53-2.services.mozilla.com" always_nxdomain
    local-zone: "normandy.cdn.mozilla.net" always_nxdomain
    local-zone: "tiles.services.mozilla.com" always_nxdomain
    local-zone: "snippets.cdn.mozilla.net" always_nxdomain
    local-zone: "location.services.mozilla.com" always_nxdomain
    local-zone: "push.services.mozilla.com" always_nxdomain
    local-zone: "firefox.settings.services.mozilla.com" always_nxdomain
```

**Restart Unbound:**
```bash
sudo systemctl restart unbound
sudo systemctl enable unbound

# Set system DNS to localhost
sudo nano /etc/resolv.conf
# Add: nameserver 127.0.0.1
```

---

### **Method 4: Firewall Rules (iptables/nftables)**

**Block telemetry at firewall level:**

```bash
# Get Mozilla telemetry IP ranges
# Mozilla uses AWS (63.245.208.0/20) for telemetry

# iptables (legacy)
sudo iptables -A OUTPUT -d 63.245.208.0/20 -j REJECT
sudo iptables-save | sudo tee /etc/iptables/iptables.rules

# nftables (modern)
sudo nft add rule inet filter output ip daddr 63.245.208.0/20 reject
sudo nft list ruleset | sudo tee /etc/nftables.conf
```

**Advantages:**
- ✅ **Blocks at network layer** (can't be bypassed)
- ✅ **Works for all protocols** (not just DNS)

**Disadvantages:**
- ❌ IP ranges can change
- ❌ May block legitimate Mozilla services

---

### **Method 5: Browser Extension (Least Effective)**

**Use uBlock Origin with custom filters:**

```
# Add to "My filters" in uBlock Origin settings:
||incoming.telemetry.mozilla.org^
||telemetry.mozilla.org^
||normandy.cdn.mozilla.net^
||tiles.services.mozilla.com^
||snippets.cdn.mozilla.net^
```

**Disadvantages:**
- ❌ Only works in browser (not system-wide)
- ❌ Can be bypassed by browser itself
- ❌ Doesn't block non-HTTP telemetry

---

## 📊 **Comparison: Which Method to Use?**

| Method | Effectiveness | Difficulty | System-Wide | Recommended? |
|--------|--------------|------------|-------------|--------------|
| **/etc/hosts** | ⭐⭐⭐ | Easy | ✅ Yes | ✅ **BEST for single PC** |
| **Pi-hole** | ⭐⭐⭐⭐⭐ | Medium | ✅ Network-wide | ✅ **BEST for home network** |
| **Unbound** | ⭐⭐⭐⭐ | Medium | ✅ Yes | ✅ Good for advanced users |
| **Firewall** | ⭐⭐⭐⭐⭐ | Hard | ✅ Yes | ⚠️ May break updates |
| **Browser Extension** | ⭐⭐ | Easy | ❌ No | ❌ Least effective |

---

## 🎯 **Recommended Solution Stack**

### **For Maximum Privacy:**

1. **Use LibreWolf** (telemetry removed at source)
2. **Add /etc/hosts blocking** (belt-and-suspenders approach)
3. **Optional: Pi-hole** (if you have multiple devices)

### **For Custom Control:**

1. **Build Firefox from source** (unlock all preferences)
2. **Add firewall rules** (block at network layer)
3. **Use Unbound DNS** (recursive resolver with blocking)

### **For Your Firefox Performance Tuner:**

**Integrate DNS blocking into the tuner:**

```bash
# Add to scripts/fix-ignored-prefs.sh or create new script:

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "DNS blocking requires root. Run with sudo or manually edit /etc/hosts"
    exit 1
fi

# Backup hosts file
cp /etc/hosts /etc/hosts.backup-$(date +%Y%m%d)

# Add Mozilla telemetry blocks
cat >> /etc/hosts << 'EOF'

# Mozilla Telemetry Blocking (added by Firefox Performance Tuner)
127.0.0.1 incoming.telemetry.mozilla.org
127.0.0.1 telemetry.mozilla.org
127.0.0.1 telemetry-incoming.r53-2.services.mozilla.com
127.0.0.1 normandy.cdn.mozilla.net
127.0.0.1 tiles.services.mozilla.com
127.0.0.1 snippets.cdn.mozilla.net
EOF

# Flush DNS cache
systemd-resolve --flush-caches 2>/dev/null || resolvectl flush-caches 2>/dev/null

echo "✅ DNS-level telemetry blocking enabled"
```

---

## 🧪 **Verify Blocking is Working**

### **Test DNS Resolution:**

```bash
# These should return 127.0.0.1 (localhost)
nslookup incoming.telemetry.mozilla.org
nslookup telemetry.mozilla.org

# Expected output:
# Server:         127.0.0.53
# Address:        127.0.0.53#53
#
# Name:   incoming.telemetry.mozilla.org
# Address: 127.0.0.1
```

### **Test with curl:**

```bash
# This should fail to connect
curl -v https://incoming.telemetry.mozilla.org

# Expected output:
# * Could not resolve host: incoming.telemetry.mozilla.org
# OR
# * Failed to connect to 127.0.0.1 port 443: Connection refused
```

### **Monitor Firefox Network Activity:**

```bash
# Install tcpdump
sudo pacman -S tcpdump  # Arch
sudo apt install tcpdump  # Debian/Ubuntu

# Monitor Firefox traffic (run while Firefox is open)
sudo tcpdump -i any -n host incoming.telemetry.mozilla.org or host telemetry.mozilla.org

# If blocking works, you should see NO output
# If blocking fails, you'll see DNS queries or HTTP requests
```

---

**Created:** 2026-02-15
**Session:** Firefox Performance Tuner - Alternatives & DNS Blocking
**Status:** ✅ COMPLETE - All methods documented with examples


