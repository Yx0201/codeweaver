#!/bin/bash
# One-click setup for the RAG evaluation Python environment
# Usage: pnpm run setup:python

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"

echo "=== RAG Eval Python Environment Setup ==="

# Check python3
if ! command -v python3 &> /dev/null; then
  echo "ERROR: python3 not found. Please install Python 3 first."
  exit 1
fi

echo "Python version: $(python3 --version)"

# Create venv
if [ -d "$VENV_DIR" ]; then
  echo "Virtual environment already exists at $VENV_DIR"
else
  echo "Creating virtual environment..."
  python3 -m venv "$VENV_DIR"
fi

# Install dependencies
echo "Installing Python dependencies..."
"$VENV_DIR/bin/pip" install --upgrade pip -q
"$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements.txt" -q

# Generate requirements.txt (refresh)
"$VENV_DIR/bin/pip" freeze > "$SCRIPT_DIR/requirements.txt"

echo ""
echo "=== Setup Complete ==="
echo "Run 'pnpm run eval:recall' to start the evaluation."
