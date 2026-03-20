export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
  tokenType: string;
}

export interface SpotifyError {
  status: number;
  message: string;
}

export class SpotifyApiError extends Error {
  constructor(public status: number, message: string, public reason?: string) {
    super(message);
    this.name = 'SpotifyApiError';
  }
}

export class SpotifyAuthRequiredError extends Error {
  constructor() {
    super('Spotify authentication required. Please authenticate at the web UI first.');
    this.name = 'SpotifyAuthRequiredError';
  }
}

// Spotify API response types
export interface Device {
  id: string | null;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
  supports_volume: boolean;
}

export interface TrackSimplified {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  track_number: number;
  artists: ArtistSimplified[];
  preview_url: string | null;
  explicit: boolean;
}

export interface Track extends TrackSimplified {
  album: AlbumSimplified;
  popularity: number;
  external_urls: { spotify: string };
}

export interface ArtistSimplified {
  id: string;
  uri: string;
  name: string;
  external_urls: { spotify: string };
}

export interface Artist extends ArtistSimplified {
  followers: { total: number };
  genres: string[];
  popularity: number;
  images: Image[];
}

export interface AlbumSimplified {
  id: string;
  uri: string;
  name: string;
  album_type: string;
  release_date: string;
  total_tracks: number;
  artists: ArtistSimplified[];
  images: Image[];
  external_urls: { spotify: string };
}

export interface Album extends AlbumSimplified {
  genres: string[];
  popularity: number;
  label: string;
  tracks: Paged<TrackSimplified>;
}

export interface Image {
  url: string;
  height: number | null;
  width: number | null;
}

export interface PlaylistSimplified {
  id: string;
  uri: string;
  name: string;
  description: string | null;
  public: boolean | null;
  collaborative: boolean;
  owner: { id: string; display_name: string | null };
  tracks: { total: number };
  images: Image[];
  external_urls: { spotify: string };
}

export interface Playlist extends PlaylistSimplified {
  followers: { total: number };
  tracks: Paged<PlaylistTrack>;
}

export interface PlaylistTrack {
  added_at: string;
  track: Track | null;
}

export interface SavedTrack {
  added_at: string;
  track: Track;
}

export interface SavedAlbum {
  added_at: string;
  album: Album;
}

export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
  previous: string | null;
}

export interface PlaybackState {
  device: Device;
  repeat_state: 'off' | 'track' | 'context';
  shuffle_state: boolean;
  context: { type: string; uri: string } | null;
  timestamp: number;
  progress_ms: number | null;
  is_playing: boolean;
  item: Track | null;
  currently_playing_type: string;
}

export interface CurrentlyPlaying {
  context: { type: string; uri: string } | null;
  timestamp: number;
  progress_ms: number | null;
  is_playing: boolean;
  item: Track | null;
  currently_playing_type: string;
}

export interface Queue {
  currently_playing: Track | null;
  queue: Track[];
}

export interface UserProfile {
  id: string;
  display_name: string | null;
  email: string;
  country: string;
  product: string;
  followers: { total: number };
  images: Image[];
  external_urls: { spotify: string };
}

export interface PlayHistoryObject {
  track: Track;
  played_at: string;
  context: { type: string; uri: string } | null;
}

export interface Category {
  id: string;
  name: string;
  icons: Image[];
}

export interface SearchResults {
  tracks?: Paged<Track>;
  albums?: Paged<AlbumSimplified>;
  artists?: Paged<Artist>;
  playlists?: Paged<PlaylistSimplified>;
  shows?: Paged<unknown>;
  episodes?: Paged<unknown>;
}

export interface RecommendationsResult {
  seeds: unknown[];
  tracks: Track[];
}

export interface PlayOptions {
  uri?: string;
  deviceId?: string;
  positionMs?: number;
  offset?: number | string;
}
