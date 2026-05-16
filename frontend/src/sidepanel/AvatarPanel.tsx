/* LiveKit avatar panel — setState in effects matches Ruwan branch provisioning flow. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useRoomContext,
  useTracks,
  useVoiceAssistant,
  type TrackReference,
} from "@livekit/components-react";
import { ConnectionState, RoomEvent, Track } from "livekit-client";
import {
  registerLiveKitAudioUnlock,
  shouldAutoUnlock,
} from "./audioUnlock";
import { createCall, getAvatars, type CreateCallResponse } from "../shared/api";
import type { AvatarListItem, Deck } from "../shared/apiTypes";
import { ensureCryptoRandomUUID } from "../lib/ensureCryptoRandomUUID";
import {
  registerAvatarBridge,
  type PlaybackState,
} from "./deckPlayback";

ensureCryptoRandomUUID();

const FETCH_TIMEOUT_MS = 30_000;
const FETCH_MAX_ATTEMPTS = 3;
const FETCH_RETRY_DELAY_MS = 1_500;
const AVATAR_STORAGE_KEY = "tutor-selected-avatar-id";

function readStoredAvatarId(): string | null {
  try {
    return localStorage.getItem(AVATAR_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredAvatarId(id: string): void {
  try {
    localStorage.setItem(AVATAR_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

async function provisionCallWithRetry(
  deck: Deck,
  avatarId: string,
  signal: AbortSignal,
): Promise<CreateCallResponse | null> {
  for (let attempt = 1; attempt <= FETCH_MAX_ATTEMPTS; attempt++) {
    const attemptController = new AbortController();
    const onParentAbort = () => attemptController.abort();
    signal.addEventListener("abort", onParentAbort);
    const timeout = setTimeout(
      () => attemptController.abort(),
      FETCH_TIMEOUT_MS,
    );

    try {
      const res = await createCall({ deck, avatar_id: avatarId });
      return res;
    } catch (err) {
      if (signal.aborted) return null;
      console.warn(
        `[tutor] /api/create-call attempt ${attempt} failed:`,
        err,
      );
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onParentAbort);
    }

    if (signal.aborted) return null;
    if (attempt < FETCH_MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, FETCH_RETRY_DELAY_MS));
    }
  }
  return null;
}

function deckKey(deck: Deck | null): string {
  if (!deck) return "";
  return `${deck.title}|${deck.segments.map((s) => s.id).join(",")}`;
}

function nextAvatarId(options: AvatarListItem[], current: string): string {
  if (options.length === 0) return current;
  const index = options.findIndex((a) => a.id === current);
  const nextIndex = index < 0 ? 0 : (index + 1) % options.length;
  return options[nextIndex].id;
}

function isLiveVideoTrack(ref: TrackReference | undefined): ref is TrackReference {
  const pub = ref?.publication;
  return Boolean(pub?.track && pub.isSubscribed);
}

function AvatarStage() {
  const { videoTrack: agentVideoTrack, state: agentState } = useVoiceAssistant();
  const allVideoTracks = useTracks(
    [Track.Source.Camera, Track.Source.Unknown, Track.Source.ScreenShare],
    { onlySubscribed: true },
  );

  const remoteVideoTrack =
    (isLiveVideoTrack(agentVideoTrack) ? agentVideoTrack : undefined) ??
    allVideoTracks.find((t) => !t.participant.isLocal && isLiveVideoTrack(t));

  if (isLiveVideoTrack(remoteVideoTrack)) {
    return (
      <VideoTrack
        trackRef={remoteVideoTrack}
        className="panel-avatar-video"
      />
    );
  }

  return (
    <div
      className={[
        "panel-avatar-video-fallback",
        agentState === "speaking" ? "panel-avatar-video-fallback--speaking" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    />
  );
}

type RoomBridgeProps = {
  deck: Deck;
  segmentIndex: number;
  playbackState: PlaybackState;
  onAutoAdvance: () => void;
};

function RoomBridge({
  deck,
  segmentIndex,
  playbackState,
  onAutoAdvance,
}: RoomBridgeProps) {
  const room = useRoomContext();
  const { state: agentState } = useVoiceAssistant();

  useEffect(() => {
    if (room.state !== ConnectionState.Connected) {
      return;
    }
    const subscribeRemoteVideo = () => {
      for (const participant of room.remoteParticipants.values()) {
        for (const pub of participant.videoTrackPublications.values()) {
          if (!pub.isSubscribed) {
            void pub.setSubscribed(true);
          }
        }
      }
    };
    subscribeRemoteVideo();
    room.on(RoomEvent.TrackPublished, subscribeRemoteVideo);
    room.on(RoomEvent.ParticipantConnected, subscribeRemoteVideo);
    return () => {
      room.off(RoomEvent.TrackPublished, subscribeRemoteVideo);
      room.off(RoomEvent.ParticipantConnected, subscribeRemoteVideo);
    };
  }, [room, room.state]);
  const wasSpeakingRef = useRef(false);
  const segmentWhenSpeechStartedRef = useRef<number | null>(null);
  const prevSegmentRef = useRef<number | null>(null);
  const deckKeyRef = useRef("");

  const key = deckKey(deck);

  useEffect(() => {
    segmentWhenSpeechStartedRef.current = segmentIndex;
  }, [segmentIndex]);

  useEffect(() => {
    const sendSay = (text: string) => {
      if (room.state !== ConnectionState.Connected) return;
      const message = `SAY: ${text}`;
      void room.localParticipant
        .sendText(message, { topic: "lk.chat" })
        .catch((err: unknown) =>
          console.warn("[tutor] avatar sendText failed:", err),
        );
    };

    registerAvatarBridge({
      sendSay,
      isConnected: () => room.state === ConnectionState.Connected,
    });
    return () => registerAvatarBridge(null);
  }, [room]);

  useEffect(() => {
    const speaking = agentState === "speaking";
    if (speaking && !wasSpeakingRef.current) {
      segmentWhenSpeechStartedRef.current = segmentIndex;
    }
    if (speaking && room.state === ConnectionState.Connected) {
      void room.startAudio().catch(() => {
        /* autoplay may still need a recent panel click */
      });
    }
    if (!speaking && wasSpeakingRef.current) {
      const startedAt = segmentWhenSpeechStartedRef.current;
      const total = deck.segments.length;
      if (
        playbackState === "speaking" &&
        total > 0 &&
        startedAt !== null &&
        startedAt === segmentIndex &&
        segmentIndex < total - 1
      ) {
        onAutoAdvance();
      }
      segmentWhenSpeechStartedRef.current = null;
    }
    wasSpeakingRef.current = speaking;
  }, [
    agentState,
    deck.segments.length,
    onAutoAdvance,
    playbackState,
    segmentIndex,
  ]);

  useEffect(() => {
    if (room.state !== ConnectionState.Connected) {
      if (room.state === ConnectionState.Disconnected) {
        prevSegmentRef.current = null;
        deckKeyRef.current = "";
      }
      return;
    }

    if (!deck.segments.length) return;

    if (key !== deckKeyRef.current) {
      deckKeyRef.current = key;
      prevSegmentRef.current = null;
    }

    if (playbackState !== "speaking") return;

    const clamped = Math.min(
      Math.max(segmentIndex, 0),
      deck.segments.length - 1,
    );
    const say = deck.segments[clamped].say.trim();
    if (!say) return;

    const sendForIndex = (idx: number) => {
      const text = deck.segments[idx]?.say.trim();
      if (!text) {
        return;
      }
      void room.localParticipant.sendText(`SAY: ${text}`, {
        topic: "lk.chat",
      });
    };

    if (prevSegmentRef.current === null) {
      prevSegmentRef.current = clamped;
      return;
    }

    if (prevSegmentRef.current === clamped) {
      return;
    }

    prevSegmentRef.current = clamped;
    sendForIndex(clamped);
  }, [deck, key, playbackState, room, segmentIndex]);

  return (
    <>
      <AvatarStage />
      <LiveKitAutoAudio />
    </>
  );
}

/** Starts remote audio playback when the room connects (after a recent panel click). */
function LiveKitAutoAudio() {
  const room = useRoomContext();

  const unlock = useCallback(async () => {
    if (room.state !== ConnectionState.Connected) {
      return;
    }
    await room.startAudio();
  }, [room]);

  useEffect(() => {
    registerLiveKitAudioUnlock(unlock);
    return () => registerLiveKitAudioUnlock(null);
  }, [unlock]);

  useEffect(() => {
    if (room.state !== ConnectionState.Connected) {
      return;
    }

    const tryStart = () => {
      if (shouldAutoUnlock() || room.canPlaybackAudio) {
        void unlock().catch(() => {
          /* retry on next gesture */
        });
      }
    };

    room.on(RoomEvent.AudioPlaybackStatusChanged, tryStart);
    room.on(RoomEvent.Connected, tryStart);
    tryStart();

    return () => {
      room.off(RoomEvent.AudioPlaybackStatusChanged, tryStart);
      room.off(RoomEvent.Connected, tryStart);
    };
  }, [room, room.state, unlock]);

  return null;
}

type AvatarPanelProps = {
  deck: Deck | null;
  sessionId: string | null;
  segmentIndex: number;
  playbackState: PlaybackState;
  onAutoAdvance: () => void;
  onError: (message: string | null) => void;
};

export default function AvatarPanel({
  deck,
  sessionId,
  segmentIndex,
  playbackState,
  onAutoAdvance,
  onError,
}: AvatarPanelProps) {
  const [creds, setCreds] = useState<CreateCallResponse | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [avatarOptions, setAvatarOptions] = useState<AvatarListItem[]>([]);
  const [selectedAvatarId, setSelectedAvatarId] = useState("");
  const [avatarsLoading, setAvatarsLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const activeDeckKeyRef = useRef<string>("");
  const lastCredsRef = useRef<CreateCallResponse | null>(null);
  const lastDeckRef = useRef<Deck | null>(null);

  if (creds) {
    lastCredsRef.current = creds;
  }
  if (deck?.segments?.length) {
    lastDeckRef.current = deck;
  }

  const roomCreds = creds ?? lastCredsRef.current;
  const bridgeDeck =
    deck?.segments?.length ? deck : lastDeckRef.current;

  const loadAvatarCatalog = useCallback(() => {
    setAvatarsLoading(true);
    setCatalogError(null);
    return getAvatars()
      .then((data) => {
        setAvatarOptions(data.avatars);
        const stored = readStoredAvatarId();
        const pick =
          stored && data.avatars.some((a) => a.id === stored)
            ? stored
            : data.default_id;
        setSelectedAvatarId(pick);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : String(err);
        setCatalogError(message);
        setAvatarOptions([]);
        setSelectedAvatarId("");
      })
      .finally(() => {
        setAvatarsLoading(false);
      });
  }, []);

  useEffect(() => {
    void loadAvatarCatalog();
  }, [loadAvatarCatalog]);

  const canPublishMic =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function";

  function handleAvatarChange(id: string) {
    if (id === selectedAvatarId) return;
    writeStoredAvatarId(id);
    setSelectedAvatarId(id);
    setCreds(null);
    lastCredsRef.current = null;
    lastDeckRef.current = null;
    activeDeckKeyRef.current = "";
  }

  function handleNextAvatar() {
    if (avatarOptions.length < 2) return;
    handleAvatarChange(nextAvatarId(avatarOptions, selectedAvatarId));
  }

  const selectedAvatarIndex = avatarOptions.findIndex(
    (a) => a.id === selectedAvatarId,
  );
  const selectedAvatarLabel =
    avatarOptions.find((a) => a.id === selectedAvatarId)?.label ?? "";
  const canCycleAvatars = avatarOptions.length > 1;
  const nextDisabled =
    avatarsLoading || connecting || !selectedAvatarId || !canCycleAvatars;
  const nextTitle = catalogError
    ? "Start the backend on http://localhost:8000, then click Retry"
    : !canCycleAvatars
      ? "Need 2+ tutors in backend BEY_AVATARS"
      : "Switch to next tutor";

  useEffect(() => {
    if (!sessionId || !selectedAvatarId) {
      setCreds(null);
      lastCredsRef.current = null;
      activeDeckKeyRef.current = "";
      return;
    }

    if (!deck?.segments?.length) {
      return;
    }

    const key = `${selectedAvatarId}|${deckKey(deck)}`;
    if (key === activeDeckKeyRef.current && creds) {
      return;
    }

    activeDeckKeyRef.current = key;
    setConnecting(true);
    onError(null);

    const ctrl = new AbortController();
    provisionCallWithRetry(deck, selectedAvatarId, ctrl.signal)
      .then((c) => {
        if (ctrl.signal.aborted) return;
        if (!c) {
          onError(
            "Could not connect avatar. Check BEY_API_KEY and avatar agent ids in backend/.env",
          );
          return;
        }
        setCreds(c);
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) {
          onError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setConnecting(false);
      });

    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- creds intentionally omitted
  }, [deck, onError, selectedAvatarId, sessionId]);

  const sayDeck = bridgeDeck ?? deck;
  const total = sayDeck?.segments.length ?? 0;
  const clampedIndex =
    total === 0 ? 0 : Math.min(Math.max(segmentIndex, 0), total - 1);
  const currentSay = sayDeck?.segments[clampedIndex]?.say ?? "";

  return (
    <section className="panel-section panel-avatar-section">
      <div className="panel-avatar-header">
        <h2 className="panel-heading panel-avatar-heading">Tutor avatar</h2>
        <div className="panel-avatar-header-actions">
            {avatarsLoading && (
            <span className="panel-avatar-current">Loading tutors…</span>
          )}
          {!avatarsLoading && !catalogError && avatarOptions.length > 0 && (
            <span className="panel-avatar-current">
              {selectedAvatarLabel
                ? canCycleAvatars
                  ? `${selectedAvatarLabel} (${selectedAvatarIndex + 1}/${avatarOptions.length})`
                  : selectedAvatarLabel
                : `${avatarOptions.length} tutor(s)`}
            </span>
          )}
        </div>
      </div>

      {catalogError && (
        <p className="panel-avatar-catalog-error">
          Could not load tutors ({catalogError}). Is the backend running on{" "}
          <code>http://localhost:8000</code>?
          <button
            type="button"
            className="panel-button panel-button--secondary panel-avatar-retry"
            onClick={() => void loadAvatarCatalog()}
          >
            Retry
          </button>
        </p>
      )}

      <div className="panel-avatar-wrap">
        <div className="panel-avatar-controls">
          <button
            type="button"
            className="panel-button panel-avatar-next-btn"
            disabled={nextDisabled}
            onClick={handleNextAvatar}
            aria-label={`Next tutor (currently ${selectedAvatarLabel || "none"})`}
            title={nextTitle}
          >
            Next tutor →
          </button>
        </div>

        <div className="panel-avatar-tile">
          <div className="panel-avatar-placeholder" aria-hidden>
            Tutor
          </div>

          {connecting && (
            <p className="panel-avatar-overlay">Updating tutor…</p>
          )}

          {!roomCreds && !connecting && !sessionId && (
            <p className="panel-avatar-overlay panel-avatar-overlay--hint">
              Start a session, then pick a mode.
            </p>
          )}

          {!roomCreds && !connecting && sessionId && !deck?.segments?.length && (
            <p className="panel-avatar-overlay panel-avatar-overlay--hint">
              Select a mode to begin.
            </p>
          )}

          {roomCreds && bridgeDeck && (
            <LiveKitRoom
              key={roomCreds.call_id}
              serverUrl={roomCreds.livekit_url}
              token={roomCreds.livekit_token}
              connect
              audio={canPublishMic}
              video={false}
              className="panel-avatar-room"
            >
              <RoomBridge
                deck={bridgeDeck}
                segmentIndex={clampedIndex}
                playbackState={playbackState}
                onAutoAdvance={onAutoAdvance}
              />
              <RoomAudioRenderer volume={1} />
            </LiveKitRoom>
          )}
        </div>
      </div>

      {currentSay && sayDeck && (
        <p className="panel-avatar-say">
          <span className="panel-avatar-say-label">
            Speaking ({clampedIndex + 1}/{total})
          </span>
          {currentSay}
        </p>
      )}
    </section>
  );
}
