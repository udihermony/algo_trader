// This file handles FYERS OAuth callback on Vercel
// It redirects to the Railway backend to process the token exchange
export default function handler(req, res) {
  const { code, state } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'Missing auth code' });
  }

  // Redirect to Railway backend with the auth code
  const backendUrl = `https://algotrader-production.up.railway.app/api/fyers/callback?code=${code}&state=${state}`;
  
  res.redirect(backendUrl);
}
