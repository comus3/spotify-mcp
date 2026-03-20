# spotify-mcp

A self-hosted [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that exposes the **Spotify Web API** as tools for assistants such as **Claude** (Desktop, Code, or any MCP client). Control playback, search, playlists, library, and browse features through natural language.

- **OAuth 2.0 with PKCE** — no client secret; safe for installed / server apps  
- **Streamable HTTP** transport at `/mcp` (MCP SDK)  
- **Small web UI** — connect Spotify and copy-paste Claude config  
- **Optional shared secret** — restrict access to `/mcp` when exposed on a network  

> **Not affiliated with Spotify AB.** This project uses Spotify’s public Web API under [Spotify’s terms](https://developer.spotify.com/terms).

## Requirements

- **Node.js 20+** (local) or **Docker**  
- A [Spotify Developer](https://developer.spotify.com/dashboard) app with your redirect URI registered  
- **HTTPS** in production (Spotify requires it for non-`localhost` redirect URIs)

## Quick start (local)

```bash
cp .env.example .env
# Edit .env: SPOTIFY_CLIENT_ID and SPOTIFY_REDIRECT_URI

npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000), click **Connect to Spotify**, then use the shown MCP URL with your client (see below).

## Quick start (Docker)

```bash
cp .env.example .env
# Edit .env — for remote access set SPOTIFY_REDIRECT_URI to your public https://.../auth/callback

docker compose up -d --build
```

Default HTTP port: **3000** (override with `PORT` in `.env` and in `docker compose` if you change the mapping).

### Reverse proxy (optional)

Put **nginx**, **Caddy**, or **NPM** in front for TLS. Your `SPOTIFY_REDIRECT_URI` must match the **public** URL (e.g. `https://spotify.example.com/auth/callback`).

To attach the container to an **existing Docker network** and avoid binding a host port, use the bundled overlay (edit the network name inside the file if needed):

```bash
docker compose -f docker-compose.yml -f docker-compose.homelab.example.yml up -d --build
```

## Spotify app setup

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create an app.  
2. Under **Redirect URIs**, add the exact value of `SPOTIFY_REDIRECT_URI` from your `.env`.  
3. Copy the **Client ID** into `SPOTIFY_CLIENT_ID`.

## Claude / MCP client configuration

The server speaks **Streamable HTTP** at:

```text
https://your-server.example.com/mcp
```

(or `http://127.0.0.1:3000/mcp` for local dev)

The web UI generates ready-to-copy snippets. Typical pattern uses [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) so Desktop/Code can talk to your HTTP endpoint:

**Claude Code**

```bash
claude mcp add spotify --command npx -- -y mcp-remote https://your-server.example.com/mcp
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "spotify": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://your-server.example.com/mcp"]
    }
  }
}
```

If you set `MCP_SECRET`, pass it to `mcp-remote` per that tool’s docs (or send `X-Mcp-Secret` / `?secret=` on requests).

### Self-signed HTTPS

Prefer a real certificate. If you must use self-signed TLS, configure your MCP client / `mcp-remote` to trust it — **do not** disable TLS verification in production.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SPOTIFY_CLIENT_ID` | Yes | Spotify app Client ID |
| `SPOTIFY_REDIRECT_URI` | Yes | Must match dashboard redirect URI |
| `PORT` | No | HTTP port (default `3000`) |
| `MCP_SECRET` | No | If set, required to call `/mcp` |

Tokens are stored under `./data/tokens.json` (or `/app/data` in Docker); keep that directory private.

## MCP tools (42)

<details>
<summary><strong>Player</strong></summary>

`get_playback_state` · `get_currently_playing` · `play` · `pause` · `next_track` · `previous_track` · `seek` · `set_volume` · `set_shuffle` · `set_repeat` · `get_devices` · `transfer_playback`

</details>

<details>
<summary><strong>Queue</strong></summary>

`get_queue` · `add_to_queue`

</details>

<details>
<summary><strong>Search & tracks</strong></summary>

`search` · `get_track` · `get_tracks` · `get_recommendations` · `get_available_genre_seeds`

</details>

<details>
<summary><strong>Albums</strong></summary>

`get_album` · `get_album_tracks` · `get_saved_albums` · `save_albums` · `remove_saved_albums` · `check_saved_albums`

</details>

<details>
<summary><strong>Artists</strong></summary>

`get_artist` · `get_artist_top_tracks` · `get_artist_albums` · `get_related_artists`

</details>

<details>
<summary><strong>Playlists</strong></summary>

`get_user_playlists` · `get_playlist` · `get_playlist_tracks` · `create_playlist` · `add_tracks_to_playlist` · `remove_tracks_from_playlist`

</details>

<details>
<summary><strong>Library</strong></summary>

`get_saved_tracks` · `save_tracks` · `remove_saved_tracks` · `check_saved_tracks`

</details>

<details>
<summary><strong>User</strong></summary>

`get_user_profile` · `get_top_tracks` · `get_top_artists` · `get_recently_played`

</details>

<details>
<summary><strong>Browse</strong></summary>

`get_featured_playlists` · `get_categories` · `get_category_playlists` · `get_new_releases`

</details>

## Stack

- **Node.js 20** + **TypeScript**  
- **[@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk)** — MCP server, Streamable HTTP  
- **Express** — HTTP + static setup UI  
- **Zod** — tool parameter schemas  

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server with `tsx` watch |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run `node dist/server.js` |

## License

MIT — see [LICENSE](LICENSE).
