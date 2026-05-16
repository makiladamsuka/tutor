"use client";

import { useEffect, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  VideoTrack,
  useConnectionState,
  useTracks,
  useVoiceAssistant,
} from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import "@livekit/components-styles";
import { useCardStore } from "../store/useCardStore";

type CallCreds = {
  call_id: string;
  livekit_url: string;
  livekit_token: string;
};

const BACKEND_URL =
  process.env.NEXT_PUBLIC_AVATAR_BACKEND_URL ?? "http://localhost:8000";

function AvatarStage() {
  const connectionState = useConnectionState();
  const { videoTrack: agentVideoTrack, state } = useVoiceAssistant();

  // Beyond Presence publishes the avatar from a separate "avatar worker"
  // participant whose kind isn't always `agent`, so useVoiceAssistant() can
  // miss it. Fall back to scanning every remote camera/unknown video track.
  const allVideoTracks = useTracks(
    [Track.Source.Camera, Track.Source.Unknown, Track.Source.ScreenShare],
    { onlySubscribed: true }
  );
  const remoteVideoTrack =
    agentVideoTrack ??
    allVideoTracks.find((t) => !t.participant.isLocal && t.publication?.track);

  if (connectionState !== ConnectionState.Connected) {
    return (
      <StatusOverlay
        title="Connecting to your tutor…"
        subtitle={`LiveKit: ${connectionState}`}
      />
    );
  }

  if (!remoteVideoTrack) {
    return (
      <StatusOverlay
        title="Waiting for tutor to join…"
        subtitle={`Agent state: ${state}`}
      />
    );
  }

  return (
    <VideoTrack
      trackRef={remoteVideoTrack}
      className="w-full h-full object-cover"
    />
  );
}

function StatusOverlay({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-white">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      <p className="text-sm font-medium">{title}</p>
      {subtitle ? (
        <p className="text-xs text-white/60">{subtitle}</p>
      ) : null}
    </div>
  );
}

function StartOverlay({ onStart }: { onStart: () => void }) {
  return (
    <button
      type="button"
      onClick={onStart}
      aria-label="Start tutor conversation"
      className="absolute inset-0 h-full w-full cursor-pointer overflow-hidden bg-black p-0"
    >
      <img
        src="/tutor.png"
        alt="Tutor"
        className="h-full w-full object-cover"
        draggable={false}
      />
    </button>
  );
}

export default function BeyondPresenceVideo() {
  // Re-render when the tutor mode changes so we can re-announce the persona.
  // (The mode is not currently piped into the agent, but reading it here keeps
  // the existing store wired up for future tool-call integrations.)
  useCardStore((state) => state.mode);

  const [started, setStarted] = useState(false);
  const [creds, setCreds] = useState<CallCreds | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only provision the Beyond Presence call once the user has clicked the
  // overlay. This keeps the avatar fully static (and saves a billed call)
  // until the user actually wants to talk.
  useEffect(() => {
    if (!started) return;
    let cancelled = false;

    const provisionCall = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/create-call`);
        if (!res.ok) {
          throw new Error(`Backend responded ${res.status}: ${await res.text()}`);
        }
        const data: CallCreds = await res.json();
        if (!cancelled) setCreds(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    provisionCall();
    return () => {
      cancelled = true;
    };
  }, [started]);

  return (
    <div
      id="bp-video-container"
      className="relative w-full h-[360px] flex-shrink-0 overflow-hidden bg-slate-900 border-b-4 border-blue-500 flex justify-center"
    >
      <div className="relative w-full max-w-[400px] h-full overflow-hidden bg-black shadow-2xl">
        {!started ? (
          <StartOverlay onStart={() => setStarted(true)} />
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <p className="text-sm font-semibold text-red-400">
              Couldn&apos;t start the tutor session.
            </p>
            <p className="break-all text-xs text-white/60">{error}</p>
          </div>
        ) : !creds ? (
          <StatusOverlay title="Provisioning tutor session…" />
        ) : (
          <LiveKitRoom
            serverUrl={creds.livekit_url}
            token={creds.livekit_token}
            connect
            audio
            video={false}
            className="h-full w-full"
            onError={(err) => setError(err.message)}
          >
            <AvatarStage />
            <RoomAudioRenderer />
            {/* Some browsers require a user gesture before autoplaying audio. */}
            <StartAudio
              label="Click to enable tutor audio"
              className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-black shadow"
            />
          </LiveKitRoom>
        )}
      </div>
    </div>
  );
}
