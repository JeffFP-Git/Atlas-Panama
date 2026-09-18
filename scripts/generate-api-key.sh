#!/bin/bash
# Generate a secure API key for production use

echo "Generating secure API key..."
echo ""

# Try different methods
if command -v openssl &> /dev/null; then
    API_KEY=$(openssl rand -hex 32)
    echo "✅ Generated using OpenSSL:"
elif command -v node &> /dev/null; then
    API_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    echo "✅ Generated using Node.js:"
elif command -v python3 &> /dev/null; then
    API_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    echo "✅ Generated using Python:"
else
    echo "❌ No suitable tool found. Install openssl, node, or python3."
    exit 1
fi

echo ""
echo "Your API Key:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "$API_KEY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Add this to your .env file on EC2:"
echo "  API_KEY=$API_KEY"
echo ""
echo "⚠️  Keep this key secure! Don't commit it to git."
echo ""

# Optionally copy to clipboard (macOS)
if command -v pbcopy &> /dev/null; then
    echo "$API_KEY" | pbcopy
    echo "✅ Copied to clipboard (macOS)"
fi

