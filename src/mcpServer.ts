import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SpotifyClient } from './spotifyClient.js';
import { SpotifyAuthRequiredError } from './types.js';

function text(content: string) {
  return { content: [{ type: 'text' as const, text: content }] };
}

function json(data: unknown) {
  return text(JSON.stringify(data, null, 2));
}

function wrap(fn: (args?: any) => Promise<unknown>) {
  return async (args?: any) => {
    try {
      const result = await fn(args);
      if (result === undefined || result === null) return text('OK');
      if (typeof result === 'string') return text(result);
      return json(result);
    } catch (err) {
      if (err instanceof SpotifyAuthRequiredError) {
        return text(`⚠️ ${err.message}`);
      }
      const msg = err instanceof Error ? err.message : String(err);
      return text(`Error: ${msg}`);
    }
  };
}

export function createMcpServer(spotify: SpotifyClient): McpServer {
  const server = new McpServer({
    name: 'spotify-mcp',
    version: '1.0.0',
  });

  // ── Player ──────────────────────────────────────────────────────────────

  server.tool(
    'get_playback_state',
    'Get the current Spotify playback state including device, track, progress, shuffle/repeat mode',
    {},
    wrap(() => spotify.getPlaybackState()),
  );

  server.tool(
    'get_currently_playing',
    'Get the currently playing track with progress',
    {},
    wrap(() => spotify.getCurrentlyPlaying()),
  );

  server.tool(
    'play',
    'Start or resume playback. Optionally provide a Spotify URI (track, album, playlist, artist) and target device.',
    {
      uri: z.string().optional().describe('Spotify URI to play, e.g. spotify:track:xxx, spotify:album:xxx, spotify:playlist:xxx, spotify:artist:xxx'),
      device_id: z.string().optional().describe('Target device ID (from get_devices)'),
      position_ms: z.number().int().min(0).optional().describe('Start position in milliseconds'),
      offset: z.union([z.number(), z.string()]).optional().describe('Offset in album/playlist: number = index, string = track URI'),
    },
    wrap(({ uri, device_id, position_ms, offset }) =>
      spotify.play({ uri, deviceId: device_id, positionMs: position_ms, offset }),
    ),
  );

  server.tool(
    'pause',
    'Pause playback',
    { device_id: z.string().optional().describe('Device ID to pause') },
    wrap(({ device_id }) => spotify.pause(device_id)),
  );

  server.tool(
    'next_track',
    'Skip to the next track',
    { device_id: z.string().optional() },
    wrap(({ device_id }) => spotify.nextTrack(device_id)),
  );

  server.tool(
    'previous_track',
    'Go to the previous track',
    { device_id: z.string().optional() },
    wrap(({ device_id }) => spotify.previousTrack(device_id)),
  );

  server.tool(
    'seek',
    'Seek to a position in the current track',
    {
      position_ms: z.number().int().min(0).describe('Position in milliseconds'),
      device_id: z.string().optional(),
    },
    wrap(({ position_ms, device_id }) => spotify.seek(position_ms, device_id)),
  );

  server.tool(
    'set_volume',
    'Set the playback volume (0–100)',
    {
      volume_percent: z.number().int().min(0).max(100).describe('Volume 0–100'),
      device_id: z.string().optional(),
    },
    wrap(({ volume_percent, device_id }) => spotify.setVolume(volume_percent, device_id)),
  );

  server.tool(
    'set_shuffle',
    'Enable or disable shuffle mode',
    {
      state: z.boolean().describe('true = shuffle on, false = shuffle off'),
      device_id: z.string().optional(),
    },
    wrap(({ state, device_id }) => spotify.setShuffle(state, device_id)),
  );

  server.tool(
    'set_repeat',
    'Set repeat mode',
    {
      state: z.enum(['off', 'track', 'context']).describe('off = no repeat, track = repeat current track, context = repeat album/playlist'),
      device_id: z.string().optional(),
    },
    wrap(({ state, device_id }) => spotify.setRepeat(state, device_id)),
  );

  server.tool(
    'get_devices',
    'List all available Spotify Connect devices',
    {},
    wrap(() => spotify.getDevices()),
  );

  server.tool(
    'transfer_playback',
    'Transfer playback to a different device',
    {
      device_id: z.string().describe('Target device ID'),
      play: z.boolean().optional().describe('Start playing immediately after transfer (default: false)'),
    },
    wrap(({ device_id, play }) => spotify.transferPlayback(device_id, play)),
  );

  // ── Queue ────────────────────────────────────────────────────────────────

  server.tool(
    'get_queue',
    'Get the current playback queue',
    {},
    wrap(() => spotify.getQueue()),
  );

  server.tool(
    'add_to_queue',
    'Add a track or episode to the playback queue',
    {
      uri: z.string().describe('Spotify URI of the track/episode to queue'),
      device_id: z.string().optional(),
    },
    wrap(({ uri, device_id }) => spotify.addToQueue(uri, device_id)),
  );

  // ── Search ───────────────────────────────────────────────────────────────

  server.tool(
    'search',
    'Search Spotify for tracks, albums, artists, playlists, shows, or episodes',
    {
      query: z.string().describe('Search query'),
      types: z.array(z.enum(['track', 'album', 'artist', 'playlist', 'show', 'episode']))
        .default(['track', 'album', 'artist', 'playlist'])
        .describe('Types to search for'),
      limit: z.number().int().min(1).max(50).default(20).describe('Results per type (1–50)'),
      offset: z.number().int().min(0).default(0).describe('Pagination offset'),
      market: z.string().optional().describe('ISO 3166-1 alpha-2 country code'),
    },
    wrap(({ query, types, limit, offset, market }) =>
      spotify.search(query, types, limit, offset, market),
    ),
  );

  // ── Tracks ───────────────────────────────────────────────────────────────

  server.tool(
    'get_track',
    'Get details about a track by its Spotify ID',
    { id: z.string().describe('Spotify track ID') },
    wrap(({ id }) => spotify.getTrack(id)),
  );

  server.tool(
    'get_tracks',
    'Get details about multiple tracks (up to 50)',
    { ids: z.array(z.string()).max(50).describe('Spotify track IDs') },
    wrap(({ ids }) => spotify.getTracks(ids)),
  );

  server.tool(
    'get_recommendations',
    'Get track recommendations based on seeds and audio features',
    {
      seed_tracks: z.array(z.string()).max(5).optional().describe('Seed track IDs (total seeds ≤ 5)'),
      seed_artists: z.array(z.string()).max(5).optional().describe('Seed artist IDs'),
      seed_genres: z.array(z.string()).max(5).optional().describe('Seed genre names'),
      limit: z.number().int().min(1).max(100).default(20),
      target_energy: z.number().min(0).max(1).optional(),
      target_valence: z.number().min(0).max(1).optional(),
      target_danceability: z.number().min(0).max(1).optional(),
      target_tempo: z.number().optional().describe('Target BPM'),
      target_popularity: z.number().int().min(0).max(100).optional(),
      min_energy: z.number().min(0).max(1).optional(),
      max_energy: z.number().min(0).max(1).optional(),
    },
    wrap(({ seed_tracks, seed_artists, seed_genres, limit, ...rest }) =>
      spotify.getRecommendations({
        seedTracks: seed_tracks,
        seedArtists: seed_artists,
        seedGenres: seed_genres,
        limit,
        ...rest,
      }),
    ),
  );

  server.tool(
    'get_available_genre_seeds',
    'Get the list of available genre seeds for recommendations',
    {},
    wrap(() => spotify.getAvailableGenreSeeds()),
  );

  // ── Albums ───────────────────────────────────────────────────────────────

  server.tool(
    'get_album',
    'Get details about an album',
    { id: z.string().describe('Spotify album ID') },
    wrap(({ id }) => spotify.getAlbum(id)),
  );

  server.tool(
    'get_album_tracks',
    'Get the tracks of an album',
    {
      id: z.string().describe('Spotify album ID'),
      limit: z.number().int().min(1).max(50).default(50),
      offset: z.number().int().min(0).default(0),
    },
    wrap(({ id, limit, offset }) => spotify.getAlbumTracks(id, limit, offset)),
  );

  server.tool(
    'get_saved_albums',
    "Get the user's saved/liked albums",
    {
      limit: z.number().int().min(1).max(50).default(20),
      offset: z.number().int().min(0).default(0),
    },
    wrap(({ limit, offset }) => spotify.getSavedAlbums(limit, offset)),
  );

  server.tool(
    'save_albums',
    "Save albums to the user's library",
    { ids: z.array(z.string()).max(50).describe('Spotify album IDs') },
    wrap(({ ids }) => spotify.saveAlbums(ids)),
  );

  server.tool(
    'remove_saved_albums',
    "Remove albums from the user's library",
    { ids: z.array(z.string()).max(50).describe('Spotify album IDs') },
    wrap(({ ids }) => spotify.removeSavedAlbums(ids)),
  );

  server.tool(
    'check_saved_albums',
    'Check if albums are saved in the library',
    { ids: z.array(z.string()).max(50) },
    wrap(({ ids }) => spotify.checkSavedAlbums(ids)),
  );

  // ── Artists ──────────────────────────────────────────────────────────────

  server.tool(
    'get_artist',
    'Get details about an artist',
    { id: z.string().describe('Spotify artist ID') },
    wrap(({ id }) => spotify.getArtist(id)),
  );

  server.tool(
    'get_artist_top_tracks',
    "Get an artist's top tracks",
    {
      id: z.string().describe('Spotify artist ID'),
      market: z.string().default('from_token').describe('ISO 3166-1 alpha-2 country code'),
    },
    wrap(({ id, market }) => spotify.getArtistTopTracks(id, market)),
  );

  server.tool(
    'get_artist_albums',
    "Get an artist's albums",
    {
      id: z.string().describe('Spotify artist ID'),
      include_groups: z.string().default('album,single').describe('Comma-separated: album, single, appears_on, compilation'),
      limit: z.number().int().min(1).max(50).default(20),
      offset: z.number().int().min(0).default(0),
    },
    wrap(({ id, include_groups, limit, offset }) =>
      spotify.getArtistAlbums(id, { include_groups, limit, offset }),
    ),
  );

  server.tool(
    'get_related_artists',
    'Get artists similar to a given artist',
    { id: z.string().describe('Spotify artist ID') },
    wrap(({ id }) => spotify.getRelatedArtists(id)),
  );

  // ── Playlists ────────────────────────────────────────────────────────────

  server.tool(
    'get_user_playlists',
    "Get the current user's playlists",
    {
      limit: z.number().int().min(1).max(50).default(50),
      offset: z.number().int().min(0).default(0),
    },
    wrap(({ limit, offset }) => spotify.getUserPlaylists(limit, offset)),
  );

  server.tool(
    'get_playlist',
    'Get details about a playlist',
    { id: z.string().describe('Spotify playlist ID') },
    wrap(({ id }) => spotify.getPlaylist(id)),
  );

  server.tool(
    'get_playlist_tracks',
    'Get the tracks in a playlist',
    {
      id: z.string().describe('Spotify playlist ID'),
      limit: z.number().int().min(1).max(50).default(50),
      offset: z.number().int().min(0).default(0),
    },
    wrap(({ id, limit, offset }) => spotify.getPlaylistTracks(id, limit, offset)),
  );

  server.tool(
    'create_playlist',
    'Create a new playlist',
    {
      name: z.string().describe('Playlist name'),
      description: z.string().optional(),
      public: z.boolean().default(false),
      collaborative: z.boolean().default(false),
    },
    wrap(({ name, description, public: pub, collaborative }) =>
      spotify.createPlaylist(name, { description, public: pub, collaborative }),
    ),
  );

  server.tool(
    'add_tracks_to_playlist',
    'Add tracks to a playlist',
    {
      playlist_id: z.string().describe('Spotify playlist ID'),
      uris: z.array(z.string()).max(100).describe('Spotify track URIs to add'),
      position: z.number().int().min(0).optional().describe('Insert position (0-indexed)'),
    },
    wrap(({ playlist_id, uris, position }) =>
      spotify.addTracksToPlaylist(playlist_id, uris, position),
    ),
  );

  server.tool(
    'remove_tracks_from_playlist',
    'Remove tracks from a playlist',
    {
      playlist_id: z.string().describe('Spotify playlist ID'),
      uris: z.array(z.string()).max(100).describe('Spotify track URIs to remove'),
    },
    wrap(({ playlist_id, uris }) => spotify.removeTracksFromPlaylist(playlist_id, uris)),
  );

  // ── Library ──────────────────────────────────────────────────────────────

  server.tool(
    'get_saved_tracks',
    "Get the user's liked/saved tracks",
    {
      limit: z.number().int().min(1).max(50).default(50),
      offset: z.number().int().min(0).default(0),
    },
    wrap(({ limit, offset }) => spotify.getSavedTracks(limit, offset)),
  );

  server.tool(
    'save_tracks',
    'Like/save tracks to the library',
    { ids: z.array(z.string()).max(50).describe('Spotify track IDs') },
    wrap(({ ids }) => spotify.saveTracks(ids)),
  );

  server.tool(
    'remove_saved_tracks',
    'Unlike/remove tracks from the library',
    { ids: z.array(z.string()).max(50) },
    wrap(({ ids }) => spotify.removeSavedTracks(ids)),
  );

  server.tool(
    'check_saved_tracks',
    'Check if tracks are saved in the library',
    { ids: z.array(z.string()).max(50) },
    wrap(({ ids }) => spotify.checkSavedTracks(ids)),
  );

  // ── User ─────────────────────────────────────────────────────────────────

  server.tool(
    'get_user_profile',
    "Get the authenticated user's Spotify profile",
    {},
    wrap(() => spotify.getUserProfile()),
  );

  server.tool(
    'get_top_tracks',
    "Get the user's top tracks over a time range",
    {
      time_range: z.enum(['long_term', 'medium_term', 'short_term'])
        .default('medium_term')
        .describe('long_term = ~1 year, medium_term = ~6 months, short_term = ~4 weeks'),
      limit: z.number().int().min(1).max(50).default(20),
      offset: z.number().int().min(0).default(0),
    },
    wrap(({ time_range, limit, offset }) => spotify.getTopTracks({ time_range, limit, offset })),
  );

  server.tool(
    'get_top_artists',
    "Get the user's top artists over a time range",
    {
      time_range: z.enum(['long_term', 'medium_term', 'short_term']).default('medium_term'),
      limit: z.number().int().min(1).max(50).default(20),
      offset: z.number().int().min(0).default(0),
    },
    wrap(({ time_range, limit, offset }) => spotify.getTopArtists({ time_range, limit, offset })),
  );

  server.tool(
    'get_recently_played',
    "Get the user's recently played tracks",
    {
      limit: z.number().int().min(1).max(50).default(50),
      before: z.number().optional().describe('Unix timestamp ms — get tracks played before this time'),
      after: z.number().optional().describe('Unix timestamp ms — get tracks played after this time'),
    },
    wrap(({ limit, before, after }) => spotify.getRecentlyPlayed(limit, before, after)),
  );

  // ── Browse ───────────────────────────────────────────────────────────────

  server.tool(
    'get_featured_playlists',
    "Get Spotify's featured playlists",
    {
      limit: z.number().int().min(1).max(50).default(20),
      offset: z.number().int().min(0).default(0),
    },
    wrap(({ limit, offset }) => spotify.getFeaturedPlaylists(limit, offset)),
  );

  server.tool(
    'get_categories',
    'Get Spotify browse categories',
    {
      limit: z.number().int().min(1).max(50).default(20),
      offset: z.number().int().min(0).default(0),
    },
    wrap(({ limit, offset }) => spotify.getCategories(limit, offset)),
  );

  server.tool(
    'get_category_playlists',
    'Get playlists for a Spotify browse category',
    {
      category_id: z.string().describe('Category ID (from get_categories)'),
      limit: z.number().int().min(1).max(50).default(20),
      offset: z.number().int().min(0).default(0),
    },
    wrap(({ category_id, limit, offset }) =>
      spotify.getCategoryPlaylists(category_id, limit, offset),
    ),
  );

  server.tool(
    'get_new_releases',
    'Get new album releases on Spotify',
    {
      limit: z.number().int().min(1).max(50).default(20),
      offset: z.number().int().min(0).default(0),
    },
    wrap(({ limit, offset }) => spotify.getNewReleases(limit, offset)),
  );

  return server;
}
