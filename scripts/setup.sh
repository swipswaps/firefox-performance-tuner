#!/bin/bash
# Firefox Performance Tuner - Interactive Setup Script
# Based on proven patterns from receipts-ocr/scripts/setup.sh
# This script guides you through setting up the full application
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_step() { echo -e "\n${BLUE}==>${NC} $1"; }
log_ok()   { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error(){ echo -e "${RED}✗${NC} $1"; }

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║       Firefox Performance Tuner - Full Setup Script       ║"
echo "║   Optimize Firefox on Linux X11 + Mesa systems            ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Step 1: Check Node.js
log_step "Step 1/5: Checking Node.js installation..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    log_ok "Node.js found: $NODE_VERSION"
    # Check minimum version (18+)
    MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
    if [ "$MAJOR" -lt 18 ]; then
        log_error "Node.js 18+ required (found $NODE_VERSION)"
        echo "  Install from: https://nodejs.org or use nvm"
        exit 1
    fi
else
    log_error "Node.js not found!"
    echo ""
    echo "  Please install Node.js 18+ first:"
    echo "    Option 1: https://nodejs.org (official installer)"
    echo "    Option 2: nvm install 20 && nvm use 20"
    echo "    Option 3: sudo dnf install nodejs  (Fedora)"
    echo "              sudo apt install nodejs   (Debian/Ubuntu)"
    exit 1
fi

# Step 2: Check npm
log_step "Step 2/5: Checking npm..."
if command -v npm &> /dev/null; then
    log_ok "npm found: $(npm --version)"
else
    log_error "npm not found (should come with Node.js)"
    exit 1
fi

# Step 3: Check/clone repo
log_step "Step 3/5: Checking repository..."
if [ -f "server.js" ] && [ -f "package.json" ] && grep -q "firefox-performance-tuner" package.json 2>/dev/null; then
    log_ok "Already in firefox-performance-tuner directory"
    REPO_DIR="."
elif [ -d "firefox-performance-tuner" ]; then
    log_ok "Found existing firefox-performance-tuner directory"
    cd firefox-performance-tuner
    REPO_DIR="firefox-performance-tuner"
else
    log_warn "Cloning repository..."
    git clone https://github.com/swipswaps/firefox-performance-tuner.git
    cd firefox-performance-tuner
    REPO_DIR="firefox-performance-tuner"
    log_ok "Repository cloned"
fi

# Step 4: Install dependencies
log_step "Step 4/5: Installing dependencies..."
echo "    Running npm install..."
npm install --silent 2>&1 | tail -3
log_ok "Dependencies installed"

# Step 5: Verify build
log_step "Step 5/5: Building frontend..."
npm run build 2>&1 | tail -5
log_ok "Build successful"

# Done — show results
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Setup Complete!                        ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get local IP
LOCAL_IP=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^172\.' | head -1 || echo "localhost")

echo "Access the app:"
echo -e "  ${BLUE}Local:${NC}       http://localhost:3000  (frontend)"
echo -e "  ${BLUE}API:${NC}         http://127.0.0.1:3001  (backend — localhost only)"
if [ "$LOCAL_IP" != "localhost" ] && [ -n "$LOCAL_IP" ]; then
    echo -e "  ${BLUE}Network:${NC}     http://${LOCAL_IP}:3000  (if firewall allows)"
fi
echo ""
echo "Quick start:"
echo -e "  ${BLUE}npm start${NC}       Start both frontend + backend"
echo -e "  ${BLUE}npm stop${NC}        Stop all services cleanly"
echo -e "  ${BLUE}npm run dev${NC}     Same as npm start"
echo ""
echo "GitHub Pages (DEMO mode — no server needed):"
echo -e "  ${BLUE}https://swipswaps.github.io/firefox-performance-tuner/${NC}"
echo ""

read -p "Start the app now? [Y/n] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    bash scripts/start.sh
fi

