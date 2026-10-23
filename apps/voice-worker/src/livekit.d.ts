/**
 * Minimal ambient declarations for the LiveKit SDKs so the voice-worker builds
 * and typechecks WITHOUT the native `@livekit/rtc-node` installed. They are only
 * loaded at runtime (dynamic import in livekit-runner.ts) when a real LiveKit
 * call runs. Install the packages (optionalDependencies) + validate against your
 * SDK version before going live — the surface here is intentionally small.
 */
declare module "@livekit/rtc-node" {
  export class AudioFrame {
    constructor(data: Int16Array, sampleRate: number, channels: number, samplesPerChannel: number);
    data: Int16Array;
    sampleRate: number;
    channels: number;
    samplesPerChannel: number;
  }

  export class AudioStream implements AsyncIterable<AudioFrame> {
    constructor(track: unknown, sampleRate?: number, channels?: number);
    [Symbol.asyncIterator](): AsyncIterator<AudioFrame>;
  }

  export class AudioSource {
    constructor(sampleRate: number, channels: number);
    captureFrame(frame: AudioFrame): Promise<void>;
  }

  export class LocalAudioTrack {
    static createAudioTrack(name: string, source: AudioSource): LocalAudioTrack;
  }

  export interface RemoteTrack {
    kind: number | string;
  }

  export class Room {
    connect(url: string, token: string, options?: unknown): Promise<void>;
    disconnect(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): this;
    once(event: string, listener: (...args: unknown[]) => void): this;
    localParticipant?: {
      publishTrack(track: LocalAudioTrack, options?: unknown): Promise<unknown>;
    };
  }

  export const RoomEvent: {
    readonly TrackSubscribed: string;
    readonly Disconnected: string;
    readonly [key: string]: string;
  };
  export const TrackKind: Record<string, number>;
  export class TrackPublishOptions {
    source?: number;
  }
  export const TrackSource: Record<string, number>;
}

declare module "livekit-server-sdk" {
  export class AccessToken {
    constructor(apiKey?: string, apiSecret?: string, options?: { identity?: string; ttl?: number | string });
    addGrant(grant: Record<string, unknown>): void;
    toJwt(): Promise<string>;
  }
}
