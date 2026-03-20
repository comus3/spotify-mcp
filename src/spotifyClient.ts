import * as crypto from 'crypto';
import { config } from './config.js';
import { TokenStore } from './tokenStore.js';
import {
  StoredTokens, SpotifyApiError, SpotifyAuthRequiredError,
  PlaybackState, CurrentlyPlaying, Device, Queue, Track, TrackSimplified,
  Album, AlbumSimplified, Artist, Playlist, PlaylistSimplified, PlaylistTrack,
  SavedTrack, SavedAlbum, UserProfile, PlayHistoryObject, Category,
  SearchResults, RecommendationsResult, Paged, PlayOptions,
} from './types.js';

const SPOTIFY_ACCOUNTS = 'https://accounts.spotify.com';
const SPOTIFY_API = 'https://api.spotify.com/v1';

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-library-read',
  'user-library-modify',
  'user-read-private',
  'user-read-email',
  'user-top-read',
  'user-read-recently-played',
].join(' ');

interface PkceSession {
  codeVerifier: string;
  expiresAt: number;
}

export class SpotifyClient {
  private store = new TokenStore();
  private tokens: StoredTokens | null = null;
  private pkce = new Map<string, PkceSession>();

  constructor() {
    this.tokens = this.store.load();
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async createLoginUrl(): Promise<string> {
    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = crypto.randomBytes(96).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    this.pkce.set(state, { codeVerifier, expiresAt: Date.now() + 15 * 60_000 });

    const params = new URLSearchParams({
      client_id: config.spotifyClientId,
      response_type: 'code',
      redirect_uri: config.spotifyRedirectUri,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      state,
      scope: SCOPES,
    });

    return `${SPOTIFY_ACCOUNTS}/authorize?${params}`;
  }

  async handleCallback(code: string, state: string): Promise<void> {
    const session = this.pkce.get(state);
    if (!session || session.expiresAt < Date.now()) {
      throw new Error('Invalid or expired OAuth state');
    }
    this.pkce.delete(state);

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.spotifyRedirectUri,
      client_id: config.spotifyClientId,
      code_verifier: session.codeVerifier,
    });

    const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, string>;
      throw new Error(`Token exchange failed: ${err.error_description ?? res.statusText}`);
    }

    const data = await res.json() as {
      access_token: string; refresh_token: string;
      expires_in: number; scope: string; token_type: string;
    };

    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000 - 20_000,
      scope: data.scope,
      tokenType: data.token_type,
    };
    this.store.save(this.tokens);
  }

  isAuthenticated(): boolean {
    return this.tokens !== null;
  }

  logout(): void {
    this.tokens = null;
    this.store.clear();
  }

  // ── Internal request helper ───────────────────────────────────────────────

  private async getAccessToken(): Promise<string> {
    if (!this.tokens) throw new SpotifyAuthRequiredError();
    if (Date.now() >= this.tokens.expiresAt) await this.refreshAccessToken();
    return this.tokens!.accessToken;
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.tokens?.refreshToken) throw new SpotifyAuthRequiredError();

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.tokens.refreshToken,
      client_id: config.spotifyClientId,
    });

    const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) throw new SpotifyAuthRequiredError();

    const data = await res.json() as {
      access_token: string; refresh_token?: string;
      expires_in: number; scope: string; token_type: string;
    };

    this.tokens = {
      ...this.tokens,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? this.tokens.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000 - 20_000,
      scope: data.scope,
      tokenType: data.token_type,
    };
    this.store.save(this.tokens);
  }

  private async request<T = void>(
    method: string,
    path: string,
    options: { query?: Record<string, string | number | boolean | undefined>; body?: unknown } = {},
    retried = false,
  ): Promise<T> {
    const token = await this.getAccessToken();

    let url = path.startsWith('http') ? path : `${SPOTIFY_API}${path}`;
    if (options.query) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined) q.set(k, String(v));
      }
      const qs = q.toString();
      if (qs) url += `?${qs}`;
    }

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });

    if (res.status === 401 && !retried) {
      await this.refreshAccessToken();
      return this.request<T>(method, path, options, true);
    }

    if (res.status === 204 || res.status === 202) return undefined as T;

    if (!res.ok) {
      let msg = `Spotify API error ${res.status}`;
      let reason: string | undefined;
      try {
        const err = await res.json() as { error?: { message?: string; reason?: string } };
        msg = err.error?.message ?? msg;
        reason = err.error?.reason;
      } catch { /* ignore */ }
      throw new SpotifyApiError(res.status, msg, reason);
    }

    const text = (await res.text()).trim();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return undefined as T;
    }
  }

  private get = <T>(path: string, query?: Record<string, string | number | boolean | undefined>) =>
    this.request<T>('GET', path, { query });

  private post = <T = void>(path: string, body?: unknown, query?: Record<string, string | number | boolean | undefined>) =>
    this.request<T>('POST', path, { body: body ?? null, query });

  private put = <T = void>(path: string, body?: unknown, query?: Record<string, string | number | boolean | undefined>) =>
    this.request<T>('PUT', path, { body: body ?? null, query });

  private delete = <T = void>(path: string, body?: unknown) =>
    this.request<T>('DELETE', path, { body });

  // ── Player ────────────────────────────────────────────────────────────────

  getPlaybackState(): Promise<PlaybackState | null> {
    return this.get<PlaybackState | null>('/me/player');
  }

  getCurrentlyPlaying(): Promise<CurrentlyPlaying | null> {
    return this.get<CurrentlyPlaying | null>('/me/player/currently-playing');
  }

  async play(options: PlayOptions = {}): Promise<void> {
    const body: Record<string, unknown> = {};
    if (options.uri) {
      if (options.uri.includes(':track:')) {
        body.uris = [options.uri];
        if (options.positionMs !== undefined) body.position_ms = options.positionMs;
      } else {
        body.context_uri = options.uri;
        if (options.offset !== undefined) {
          body.offset = typeof options.offset === 'number'
            ? { position: options.offset }
            : { uri: options.offset };
        }
        if (options.positionMs !== undefined) body.position_ms = options.positionMs;
      }
    }
    const query = options.deviceId ? { device_id: options.deviceId } : undefined;
    await this.put('/me/player/play', body, query);
  }

  pause(deviceId?: string): Promise<void> {
    return this.put('/me/player/pause', undefined, deviceId ? { device_id: deviceId } : undefined);
  }

  nextTrack(deviceId?: string): Promise<void> {
    return this.post('/me/player/next', undefined, deviceId ? { device_id: deviceId } : undefined);
  }

  previousTrack(deviceId?: string): Promise<void> {
    return this.post('/me/player/previous', undefined, deviceId ? { device_id: deviceId } : undefined);
  }

  seek(positionMs: number, deviceId?: string): Promise<void> {
    return this.put('/me/player/seek', undefined, {
      position_ms: positionMs,
      ...(deviceId ? { device_id: deviceId } : {}),
    });
  }

  setVolume(volumePercent: number, deviceId?: string): Promise<void> {
    return this.put('/me/player/volume', undefined, {
      volume_percent: volumePercent,
      ...(deviceId ? { device_id: deviceId } : {}),
    });
  }

  setShuffle(state: boolean, deviceId?: string): Promise<void> {
    return this.put('/me/player/shuffle', undefined, {
      state,
      ...(deviceId ? { device_id: deviceId } : {}),
    });
  }

  setRepeat(state: 'off' | 'track' | 'context', deviceId?: string): Promise<void> {
    return this.put('/me/player/repeat', undefined, {
      state,
      ...(deviceId ? { device_id: deviceId } : {}),
    });
  }

  async getDevices(): Promise<Device[]> {
    const data = await this.get<{ devices: Device[] }>('/me/player/devices');
    return data?.devices ?? [];
  }

  transferPlayback(deviceId: string, play = false): Promise<void> {
    return this.put('/me/player', { device_ids: [deviceId], play });
  }

  // ── Queue ─────────────────────────────────────────────────────────────────

  getQueue(): Promise<Queue> {
    return this.get<Queue>('/me/player/queue');
  }

  addToQueue(uri: string, deviceId?: string): Promise<void> {
    return this.post('/me/player/queue', undefined, {
      uri,
      ...(deviceId ? { device_id: deviceId } : {}),
    });
  }

  // ── Search ────────────────────────────────────────────────────────────────

  search(
    query: string,
    types: Array<'track' | 'album' | 'artist' | 'playlist' | 'show' | 'episode'>,
    limit = 20,
    offset = 0,
    market?: string,
  ): Promise<SearchResults> {
    return this.get<SearchResults>('/search', {
      q: query,
      type: types.join(','),
      limit,
      offset,
      ...(market ? { market } : {}),
    });
  }

  // ── Tracks ────────────────────────────────────────────────────────────────

  getTrack(id: string): Promise<Track> {
    return this.get<Track>(`/tracks/${id}`);
  }

  async getTracks(ids: string[]): Promise<Track[]> {
    const data = await this.get<{ tracks: Track[] }>('/tracks', { ids: ids.join(',') });
    return data.tracks;
  }

  getRecommendations(options: {
    seedTracks?: string[];
    seedArtists?: string[];
    seedGenres?: string[];
    limit?: number;
    [key: string]: unknown;
  }): Promise<RecommendationsResult> {
    const { seedTracks, seedArtists, seedGenres, limit = 20, ...rest } = options;
    return this.get<RecommendationsResult>('/recommendations', {
      ...(seedTracks?.length ? { seed_tracks: seedTracks.join(',') } : {}),
      ...(seedArtists?.length ? { seed_artists: seedArtists.join(',') } : {}),
      ...(seedGenres?.length ? { seed_genres: seedGenres.join(',') } : {}),
      limit,
      ...Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, String(v)])),
    });
  }

  getAvailableGenreSeeds(): Promise<{ genres: string[] }> {
    return this.get<{ genres: string[] }>('/recommendations/available-genre-seeds');
  }

  // ── Albums ────────────────────────────────────────────────────────────────

  getAlbum(id: string): Promise<Album> {
    return this.get<Album>(`/albums/${id}`);
  }

  getAlbumTracks(id: string, limit = 50, offset = 0): Promise<Paged<TrackSimplified>> {
    return this.get<Paged<TrackSimplified>>(`/albums/${id}/tracks`, { limit, offset });
  }

  getSavedAlbums(limit = 20, offset = 0): Promise<Paged<SavedAlbum>> {
    return this.get<Paged<SavedAlbum>>('/me/albums', { limit, offset });
  }

  saveAlbums(ids: string[]): Promise<void> {
    return this.put('/me/albums', { ids });
  }

  removeSavedAlbums(ids: string[]): Promise<void> {
    return this.delete('/me/albums', { ids });
  }

  async checkSavedAlbums(ids: string[]): Promise<boolean[]> {
    return this.get<boolean[]>('/me/albums/contains', { ids: ids.join(',') });
  }

  // ── Artists ───────────────────────────────────────────────────────────────

  getArtist(id: string): Promise<Artist> {
    return this.get<Artist>(`/artists/${id}`);
  }

  async getArtistTopTracks(id: string, market = 'from_token'): Promise<Track[]> {
    const data = await this.get<{ tracks: Track[] }>(`/artists/${id}/top-tracks`, { market });
    return data.tracks;
  }

  getArtistAlbums(
    id: string,
    options: { include_groups?: string; limit?: number; offset?: number } = {},
  ): Promise<Paged<AlbumSimplified>> {
    return this.get<Paged<AlbumSimplified>>(`/artists/${id}/albums`, {
      include_groups: options.include_groups ?? 'album,single',
      limit: options.limit ?? 20,
      offset: options.offset ?? 0,
    });
  }

  async getRelatedArtists(id: string): Promise<Artist[]> {
    const data = await this.get<{ artists: Artist[] }>(`/artists/${id}/related-artists`);
    return data.artists;
  }

  // ── Playlists ─────────────────────────────────────────────────────────────

  getUserPlaylists(limit = 50, offset = 0): Promise<Paged<PlaylistSimplified>> {
    return this.get<Paged<PlaylistSimplified>>('/me/playlists', { limit, offset });
  }

  getPlaylist(id: string): Promise<Playlist> {
    return this.get<Playlist>(`/playlists/${id}`);
  }

  getPlaylistTracks(id: string, limit = 50, offset = 0): Promise<Paged<PlaylistTrack>> {
    return this.get<Paged<PlaylistTrack>>(`/playlists/${id}/tracks`, { limit, offset });
  }

  async createPlaylist(
    name: string,
    options: { description?: string; public?: boolean; collaborative?: boolean } = {},
  ): Promise<Playlist> {
    const profile = await this.getUserProfile();
    return this.post<Playlist>(`/users/${profile.id}/playlists`, {
      name,
      description: options.description ?? '',
      public: options.public ?? false,
      collaborative: options.collaborative ?? false,
    });
  }

  async addTracksToPlaylist(playlistId: string, uris: string[], position?: number): Promise<void> {
    await this.post(`/playlists/${playlistId}/tracks`, {
      uris,
      ...(position !== undefined ? { position } : {}),
    });
  }

  async removeTracksFromPlaylist(playlistId: string, uris: string[]): Promise<void> {
    await this.delete(`/playlists/${playlistId}/tracks`, {
      tracks: uris.map(uri => ({ uri })),
    });
  }

  // ── Library ───────────────────────────────────────────────────────────────

  getSavedTracks(limit = 50, offset = 0): Promise<Paged<SavedTrack>> {
    return this.get<Paged<SavedTrack>>('/me/tracks', { limit, offset });
  }

  saveTracks(ids: string[]): Promise<void> {
    return this.put('/me/tracks', { ids });
  }

  removeSavedTracks(ids: string[]): Promise<void> {
    return this.delete('/me/tracks', { ids });
  }

  checkSavedTracks(ids: string[]): Promise<boolean[]> {
    return this.get<boolean[]>('/me/tracks/contains', { ids: ids.join(',') });
  }

  // ── User ──────────────────────────────────────────────────────────────────

  getUserProfile(): Promise<UserProfile> {
    return this.get<UserProfile>('/me');
  }

  getTopTracks(options: { time_range?: 'long_term' | 'medium_term' | 'short_term'; limit?: number; offset?: number } = {}): Promise<Paged<Track>> {
    return this.get<Paged<Track>>('/me/top/tracks', {
      time_range: options.time_range ?? 'medium_term',
      limit: options.limit ?? 20,
      offset: options.offset ?? 0,
    });
  }

  getTopArtists(options: { time_range?: 'long_term' | 'medium_term' | 'short_term'; limit?: number; offset?: number } = {}): Promise<Paged<Artist>> {
    return this.get<Paged<Artist>>('/me/top/artists', {
      time_range: options.time_range ?? 'medium_term',
      limit: options.limit ?? 20,
      offset: options.offset ?? 0,
    });
  }

  getRecentlyPlayed(limit = 50, before?: number, after?: number): Promise<Paged<PlayHistoryObject>> {
    return this.get<Paged<PlayHistoryObject>>('/me/player/recently-played', {
      limit,
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
    });
  }

  // ── Browse ────────────────────────────────────────────────────────────────

  async getFeaturedPlaylists(limit = 20, offset = 0): Promise<{ message: string; playlists: Paged<PlaylistSimplified> }> {
    return this.get('/browse/featured-playlists', { limit, offset });
  }

  async getCategories(limit = 20, offset = 0): Promise<Paged<Category>> {
    const data = await this.get<{ categories: Paged<Category> }>('/browse/categories', { limit, offset });
    return data.categories;
  }

  async getCategoryPlaylists(categoryId: string, limit = 20, offset = 0): Promise<Paged<PlaylistSimplified>> {
    const data = await this.get<{ playlists: Paged<PlaylistSimplified> }>(`/browse/categories/${categoryId}/playlists`, { limit, offset });
    return data.playlists;
  }

  async getNewReleases(limit = 20, offset = 0): Promise<Paged<AlbumSimplified>> {
    const data = await this.get<{ albums: Paged<AlbumSimplified> }>('/browse/new-releases', { limit, offset });
    return data.albums;
  }
}
