import * as dotenv from 'dotenv';
dotenv.config();

function require(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: parseInt(optional('PORT', '3000'), 10),
  spotifyClientId: require('SPOTIFY_CLIENT_ID'),
  spotifyRedirectUri: require('SPOTIFY_REDIRECT_URI'),
  mcpSecret: optional('MCP_SECRET'),
};
