#!/bin/bash
# Start Firefox Performance Tuner servers in visible terminal
# Run this in your terminal /dev/pts/1

set -e

echo "🦊 Starting Firefox Performance Tuner..."
echo "Current terminal: $(tty)"
echo ""

cd "$(dirname "$0")"

echo "Starting servers..."
npm start

