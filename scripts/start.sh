#!/bin/bash
# Firefox Performance Tuner - Start Script
# Based on proven patterns from receipts-ocr/scripts/start.sh
# Manages Express backend + Vite frontend with PID tracking and firewall
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

# Ports
BACKEND_PORT=3001
FRONTEND_PORT=3000

echo ""
echo -e "${BLUE}━━━ Firefox Performance Tuner ━━━${NC}"
echo -e "  Backend port:  ${GREEN}$BACKEND_PORT${NC} (localhost only)"
echo -e "  Frontend port: ${GREEN}$FRONTEND_PORT${NC}"

# Check if port is in use by another process
check_port() {
    local port=$1
    local label=$2
    local pid_on_port=$(lsof -ti:$port 2>/dev/null | head -1)

    if [ -n "$pid_on_port" ]; then
        local proc_name=$(ps -p $pid_on_port -o comm= 2>/dev/null)
        echo -e "  ${RED}✗${NC} Port $port ($label) in use by: $proc_name (PID $pid_on_port)"
        echo -e "  Run ${BLUE}npm stop${NC} first, or kill the process"
        return 1
    fi
    return 0
}

# Add firewall rules for frontend port (backend is localhost-only)
add_firewall_rules() {
    local added_rules=""

    if command -v firewall-cmd &> /dev/null && systemctl is-active --quiet firewalld 2>/dev/null; then
        if ! firewall-cmd --query-port=$FRONTEND_PORT/tcp &>/dev/null; then
            sudo firewall-cmd --add-port=$FRONTEND_PORT/tcp --permanent &>/dev/null
            added_rules="$added_rules firewalld:$FRONTEND_PORT"
            sudo firewall-cmd --reload &>/dev/null
        fi
    elif command -v ufw &> /dev/null && sudo ufw status 2>/dev/null | grep -q "Status: active"; then
        if ! sudo ufw status | grep -q "$FRONTEND_PORT"; then
            sudo ufw allow $FRONTEND_PORT/tcp comment "Firefox Tuner frontend" &>/dev/null
            added_rules="$added_rules ufw:$FRONTEND_PORT"
        fi
    fi

    if [ -n "$added_rules" ]; then
        echo "$added_rules" > "$FIREWALL_STATE_FILE"
        echo -e "  ${GREEN}✓${NC} Firewall rules added (port $FRONTEND_PORT)"
    else
        echo -e "  ${GREEN}✓${NC} Firewall OK"
    fi
}

# 1. Check port availability
echo ""
echo -n "  Checking port $BACKEND_PORT (backend)... "
if check_port $BACKEND_PORT "backend"; then
    echo -e "${GREEN}available${NC}"
else
    exit 1
fi
echo -n "  Checking port $FRONTEND_PORT (frontend)... "
if check_port $FRONTEND_PORT "frontend"; then
    echo -e "${GREEN}available${NC}"
else
    exit 1
fi

# 2. Configure firewall (frontend only — backend is localhost-only)
add_firewall_rules

# 3. Start Express backend
echo ""
echo -e "${GREEN}━━━ Starting Backend ━━━${NC}"
cd "$PROJECT_DIR"
node server.js &
SERVER_PID=$!
echo $SERVER_PID > "$SERVER_PID_FILE"

# Wait for backend health
echo -n "  Waiting for backend"
for i in {1..15}; do
    if curl -s --max-time 2 http://127.0.0.1:$BACKEND_PORT/api/health > /dev/null 2>&1; then
        echo -e " ${GREEN}ready${NC}"
        break
    fi
    echo -n "."
    sleep 1
done

if ! curl -s --max-time 2 http://127.0.0.1:$BACKEND_PORT/api/health > /dev/null 2>&1; then
    echo -e " ${YELLOW}timeout (server may still be starting)${NC}"
fi

# 4. Start Vite dev server
echo ""
echo -e "${GREEN}━━━ Starting Frontend ━━━${NC}"
cd "$PROJECT_DIR"
npx vite --host --port $FRONTEND_PORT --strictPort &
VITE_PID=$!
echo $VITE_PID > "$VITE_PID_FILE"

# Wait a moment then show URLs
sleep 2
LOCAL_IP=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^172\.' | head -1)
echo ""
echo -e "  ${GREEN}✓${NC} Backend running  (PID: $SERVER_PID) — http://127.0.0.1:$BACKEND_PORT"
echo -e "  ${GREEN}✓${NC} Frontend running (PID: $VITE_PID)"
echo -e "  Local:   ${BLUE}http://localhost:$FRONTEND_PORT${NC}"
if [ -n "$LOCAL_IP" ]; then
    echo -e "  Network: ${BLUE}http://$LOCAL_IP:$FRONTEND_PORT${NC}"
fi
echo ""
echo -e "  Stop with: ${BLUE}npm stop${NC}  or  ${BLUE}bash scripts/stop.sh${NC}"
echo ""

# Wait for either process to exit
wait -n $SERVER_PID $VITE_PID 2>/dev/null || true

# If we get here, one process died — clean up the other
echo -e "\n  ${YELLOW}⚠${NC} A process exited. Cleaning up..."
kill $SERVER_PID 2>/dev/null || true
kill $VITE_PID 2>/dev/null || true
rm -f "$SERVER_PID_FILE" "$VITE_PID_FILE"

