#!/bin/bash

# Manual Fyers API Test Script
# This will help debug the 400 error by testing the API directly

echo "🔍 Manual Fyers API Test"
echo "======================="

# Get auth URL and extract parameters
echo "Step 1: Getting auth URL..."
AUTH_URL=$(curl -s "https://algotrader-production.up.railway.app/api/fyers/login" | grep -o 'https://api-t1.fyers.in[^"]*' | head -1)

if [ -n "$AUTH_URL" ]; then
    echo "✅ Auth URL: $AUTH_URL"
    
    # Extract parameters
    CLIENT_ID=$(echo "$AUTH_URL" | grep -o 'client_id=[^&]*' | cut -d'=' -f2)
    REDIRECT_URI=$(echo "$AUTH_URL" | grep -o 'redirect_uri=[^&]*' | cut -d'=' -f2)
    STATE=$(echo "$AUTH_URL" | grep -o 'state=[^&]*' | cut -d'=' -f2)
    
    echo "Client ID: $CLIENT_ID"
    echo "Redirect URI: $REDIRECT_URI"
    echo "State: $STATE"
    
    # Decode redirect URI
    DECODED_URI=$(python3 -c "import urllib.parse; print(urllib.parse.unquote('$REDIRECT_URI'))")
    echo "Decoded Redirect URI: $DECODED_URI"
    
else
    echo "❌ Failed to get auth URL"
    exit 1
fi

echo ""
echo "Step 2: Manual Testing Instructions"
echo "=================================="
echo "1. Open this URL in your browser:"
echo "   $AUTH_URL"
echo ""
echo "2. Complete the Fyers login process"
echo ""
echo "3. After login, you'll be redirected to:"
echo "   $DECODED_URI?code=XXXXX&state=$STATE"
echo ""
echo "4. Copy the 'code' parameter from the URL"
echo ""
echo "5. Test the token exchange manually:"
echo ""
echo "   curl -X POST 'https://api-t1.fyers.in/api/v3/validate-authcode' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{"
echo "       \"grant_type\": \"authorization_code\","
echo "       \"appIdHash\": \"YOUR_APP_ID_HASH\","
echo "       \"code\": \"PASTE_CODE_HERE\""
echo "     }'"
echo ""
echo "Step 3: Common 400 Error Causes"
echo "==============================="
echo "❌ Invalid appIdHash (wrong app_id or secret_key)"
echo "❌ Expired auth code (codes expire quickly)"
echo "❌ Already used auth code"
echo "❌ Wrong redirect_uri in Fyers app settings"
echo "❌ App permissions insufficient"
echo "❌ App blocked or suspended"
echo "❌ Rate limit exceeded"
echo ""
echo "Step 4: Debugging Steps"
echo "======================"
echo "1. Check Fyers app status in dashboard"
echo "2. Verify app permissions are correct"
echo "3. Check if app is blocked/suspended"
echo "4. Verify app_id and secret_key in Railway"
echo "5. Test with fresh auth code (don't reuse)"
echo "6. Check Railway logs for detailed error response"
