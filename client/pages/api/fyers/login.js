// This file handles FYERS login redirect on Vercel
// It redirects to the Railway backend to initiate OAuth flow
export default function handler(req, res) {
  // Redirect to Railway backend login endpoint
  const backendUrl = 'https://algotrader-production.up.railway.app/api/fyers/login';
  
  res.redirect(backendUrl);
}
