#!/bin/bash
# Block Mozilla telemetry at DNS level using /etc/hosts
# Part of Firefox Performance Tuner

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Mozilla telemetry domains
TELEMETRY_DOMAINS=(
    "incoming.telemetry.mozilla.org"
    "telemetry.mozilla.org"
    "telemetry-incoming.r53-2.services.mozilla.com"
    "telemetry-experiment.cdn.mozilla.net"
    "normandy.cdn.mozilla.net"
    "normandy-cdn.services.mozilla.com"
    "tiles.services.mozilla.com"
    "tiles-cloudfront.cdn.mozilla.net"
    "snippets.cdn.mozilla.net"
    "snippets.mozilla.com"
    "location.services.mozilla.com"
    "push.services.mozilla.com"
    "tracking-protection.cdn.mozilla.net"
    "firefox.settings.services.mozilla.com"
    "shavar.services.mozilla.com"
    "content-signature-2.cdn.mozilla.net"
)

HOSTS_FILE="/etc/hosts"
BACKUP_FILE="/etc/hosts.backup-$(date +%Y%m%d-%H%M%S)"
MARKER="# Mozilla Telemetry Blocking (Firefox Performance Tuner)"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ ERROR: This script must be run as root${NC}"
    echo -e "${YELLOW}Run with: sudo $0${NC}"
    exit 1
fi

echo -e "${BLUE}━━━ Mozilla Telemetry DNS Blocker ━━━${NC}"
echo ""

# Check if already blocked
if grep -q "$MARKER" "$HOSTS_FILE" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Telemetry blocking already enabled in $HOSTS_FILE${NC}"
    echo ""
    read -p "Remove existing blocks and re-add? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Removing existing blocks...${NC}"
        # Remove all lines between marker and next blank line
        sed -i "/$MARKER/,/^$/d" "$HOSTS_FILE"
    else
        echo -e "${GREEN}✅ No changes made${NC}"
        exit 0
    fi
fi

# Backup hosts file
echo -e "${YELLOW}📦 Creating backup: $BACKUP_FILE${NC}"
cp "$HOSTS_FILE" "$BACKUP_FILE"

# Add telemetry blocks
echo -e "${YELLOW}🔒 Adding DNS blocks for ${#TELEMETRY_DOMAINS[@]} Mozilla telemetry domains...${NC}"

cat >> "$HOSTS_FILE" << EOF

$MARKER
EOF

for domain in "${TELEMETRY_DOMAINS[@]}"; do
    echo "127.0.0.1 $domain" >> "$HOSTS_FILE"
    echo -e "   ${GREEN}✓${NC} Blocked: $domain"
done

echo "" >> "$HOSTS_FILE"

# Flush DNS cache
echo ""
echo -e "${YELLOW}🔄 Flushing DNS cache...${NC}"

if command -v systemd-resolve &> /dev/null; then
    systemd-resolve --flush-caches 2>/dev/null && echo -e "${GREEN}✓${NC} systemd-resolved cache flushed"
elif command -v resolvectl &> /dev/null; then
    resolvectl flush-caches 2>/dev/null && echo -e "${GREEN}✓${NC} resolvectl cache flushed"
elif command -v systemctl &> /dev/null && systemctl is-active --quiet systemd-resolved; then
    systemctl restart systemd-resolved && echo -e "${GREEN}✓${NC} systemd-resolved restarted"
else
    echo -e "${YELLOW}⚠️  Could not flush DNS cache (no systemd-resolved)${NC}"
fi

# Verify blocking
echo ""
echo -e "${BLUE}━━━ Verification ━━━${NC}"
echo ""

TEST_DOMAIN="incoming.telemetry.mozilla.org"
echo -e "${YELLOW}Testing DNS resolution for: $TEST_DOMAIN${NC}"

if command -v nslookup &> /dev/null; then
    RESULT=$(nslookup "$TEST_DOMAIN" 2>&1 | grep -A1 "Name:" | grep "Address:" | awk '{print $2}' | head -1)
    if [ "$RESULT" = "127.0.0.1" ]; then
        echo -e "${GREEN}✅ SUCCESS: $TEST_DOMAIN resolves to 127.0.0.1 (blocked)${NC}"
    else
        echo -e "${RED}❌ FAILED: $TEST_DOMAIN resolves to $RESULT (not blocked)${NC}"
    fi
elif command -v host &> /dev/null; then
    RESULT=$(host "$TEST_DOMAIN" 2>&1 | grep "has address" | awk '{print $4}')
    if [ "$RESULT" = "127.0.0.1" ]; then
        echo -e "${GREEN}✅ SUCCESS: $TEST_DOMAIN resolves to 127.0.0.1 (blocked)${NC}"
    else
        echo -e "${RED}❌ FAILED: $TEST_DOMAIN resolves to $RESULT (not blocked)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Cannot verify (nslookup/host not installed)${NC}"
fi

# Summary
echo ""
echo -e "${BLUE}━━━ Summary ━━━${NC}"
echo -e "${GREEN}✅ Blocked ${#TELEMETRY_DOMAINS[@]} Mozilla telemetry domains${NC}"
echo -e "${GREEN}✅ Backup saved to: $BACKUP_FILE${NC}"
echo ""
echo -e "${YELLOW}To remove blocks:${NC}"
echo -e "   sudo sed -i '/$MARKER/,/^$/d' $HOSTS_FILE"
echo ""
echo -e "${YELLOW}To restore from backup:${NC}"
echo -e "   sudo cp $BACKUP_FILE $HOSTS_FILE"
echo ""
echo -e "${GREEN}✅ DNS-level telemetry blocking complete!${NC}"

