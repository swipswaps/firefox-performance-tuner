#!/bin/bash
# Firefox Performance Tuner - Stop Script
# Based on proven patterns from receipts-ocr/scripts/stop.sh
# Kills only processes WE started, removes only firewall rules WE added
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_PID_FILE="$PROJECT_DIR/.server.pid"
VITE_PID_FILE="$PROJECT_DIR/.vite.pid"
FIREWALL_STATE_FILE="$PROJECT_DIR/.firewall-rules-added"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}━━━ Firefox Performance Tuner Stop ━━━${NC}"

# 1. Stop Express backend (only if we have the PID file)
if [ -f "$SERVER_PID_FILE" ]; then
    SERVER_PID=$(cat "$SERVER_PID_FILE")
    if ps -p $SERVER_PID > /dev/null 2>&1; then
        PROC_CMD=$(ps -p $SERVER_PID -o comm= 2>/dev/null)
        if [[ "$PROC_CMD" == "node" ]]; then
            kill $SERVER_PID 2>/dev/null
            echo -e "  ${GREEN}✓${NC} Stopped backend server (PID: $SERVER_PID)"
        else
            echo -e "  ${YELLOW}⚠${NC} PID $SERVER_PID is not node (is: $PROC_CMD), skipping"
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} Backend already stopped"
    fi
    rm -f "$SERVER_PID_FILE"
else
    echo -e "  ${YELLOW}⚠${NC} No backend PID file — was app started with scripts/start.sh?"
fi

# 2. Stop Vite dev server (only if we have the PID file)
if [ -f "$VITE_PID_FILE" ]; then
    VITE_PID=$(cat "$VITE_PID_FILE")
    if ps -p $VITE_PID > /dev/null 2>&1; then
        PROC_CMD=$(ps -p $VITE_PID -o comm= 2>/dev/null)
        if [[ "$PROC_CMD" == "node" || "$PROC_CMD" == "vite" ]]; then
            kill $VITE_PID 2>/dev/null
            echo -e "  ${GREEN}✓${NC} Stopped frontend server (PID: $VITE_PID)"
        else
            echo -e "  ${YELLOW}⚠${NC} PID $VITE_PID is not vite/node (is: $PROC_CMD), skipping"
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} Frontend already stopped"
    fi
    rm -f "$VITE_PID_FILE"
else
    echo -e "  ${YELLOW}⚠${NC} No frontend PID file"
fi

# 3. Remove firewall rules that WE added (not pre-existing ones)
if [ -f "$FIREWALL_STATE_FILE" ]; then
    RULES_ADDED=$(cat "$FIREWALL_STATE_FILE")

    for rule in $RULES_ADDED; do
        FIREWALL_TYPE="${rule%%:*}"
        PORT="${rule##*:}"

        if [ "$FIREWALL_TYPE" = "firewalld" ]; then
            sudo firewall-cmd --remove-port=$PORT/tcp --permanent &>/dev/null
            echo -e "  ${GREEN}✓${NC} Removed firewalld rule for port $PORT"
        elif [ "$FIREWALL_TYPE" = "ufw" ]; then
            sudo ufw delete allow $PORT/tcp &>/dev/null
            echo -e "  ${GREEN}✓${NC} Removed ufw rule for port $PORT"
        fi
    done

    # Reload firewalld if we removed rules
    if echo "$RULES_ADDED" | grep -q "firewalld"; then
        sudo firewall-cmd --reload &>/dev/null
    fi

    rm -f "$FIREWALL_STATE_FILE"
else
    echo -e "  ${YELLOW}⚠${NC} No firewall state file — no rules to remove"
fi

echo ""
echo -e "${GREEN}━━━ Cleanup Complete ━━━${NC}"
echo ""

