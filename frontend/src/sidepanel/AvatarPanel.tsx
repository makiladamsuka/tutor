"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  VideoTrack,
  useRoomContext,
  useTracks,
  useVoiceAssistant,
} from "@livekit/components-react";
import { ConnectionState, RoomEvent, Track, type Room } from "livekit-client";
import "@livekit/components-styles";
import { createCall, getAvatars, type CreateCallResponse } from "../shared/api";
import type { AvatarListItem, Deck } from "../shared/apiTypes";
import { ensureCryptoRandomUUID } from "../lib/ensureCryptoRandomUUID";
import {
  registerAvatarBridge,
  type PlaybackState,
} from "./deckPlayback";
import AvatarPhotoCard from "./AvatarPhotoCard";

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

function AvatarStage() {
  const { videoTrack: agentVideoTrack } = useVoiceAssistant();
  const allVideoTracks = useTracks(
    [Track.Source.Camera, Track.Source.Unknown, Track.Source.ScreenShare],
    { onlySubscribed: true },
  );
  const remoteVideoTrack =
    agentVideoTrack ??
    allVideoTracks.find((t) => !t.participant.isLocal && t.publication?.track);

  if (!remoteVideoTrack) return null;

  return (
    <VideoTrack
      trackRef={remoteVideoTrack}
      className="panel-avatar-video"
    />
  );
}

/** Register SAY bridge for deckPlayback.speakSegment (Resume, etc.). */
function AvatarBridgeRegister() {
  const room = useRoomContext();

  useEffect(() => {
    const sendSay = (text: string) => {
      if (room.state !== ConnectionState.Connected) return;
      void room.localParticipant
        .sendText(`SAY: ${text}`, { topic: "lk.chat" })
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

  return null;
}

const MIN_SPEECH_MS = 500;
const ADVANCE_COOLDOWN_MS = 400;

/** Bey avatars may not set voice-assistant state to "speaking"; also watch LiveKit speakers. */
function useAgentSpeaking(room: Room, voiceAssistantState: string | undefined): boolean {
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);

  useEffect(() => {
    if (room.state !== ConnectionState.Connected) {
      setRemoteSpeaking(false);
      return;
    }

    const update = () => {
      let speaking = false;
      for (const participant of room.remoteParticipants.values()) {
        if (participant.isSpeaking) {
          speaking = true;
          break;
        }
      }
      setRemoteSpeaking(speaking);
    };

    room.on(RoomEvent.ActiveSpeakersChanged, update);
    room.on(RoomEvent.ParticipantConnected, update);
    room.on(RoomEvent.ParticipantDisconnected, update);
    update();

    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, update);
      room.off(RoomEvent.ParticipantConnected, update);
      room.off(RoomEvent.ParticipantDisconnected, update);
    };
  }, [room, room.state]);

  return voiceAssistantState === "speaking" || remoteSpeaking;
}

/**
 * Advance one slide only after the tutor finishes reading the current segment.
 */
function AutoAdvanceOnSpeechEnd({
  deck,
  segmentIndex,
  playbackState,
  onAutoAdvance,
}: {
  deck: Deck;
  segmentIndex: number;
  playbackState: PlaybackState;
  onAutoAdvance: () => void;
}) {
  const room = useRoomContext();
  const { state: agentState } = useVoiceAssistant();
  const agentSpeaking = useAgentSpeaking(room, agentState);

  const wasSpeakingRef = useRef(false);
  const segmentWhenSpeechStartedRef = useRef<number | null>(null);
  const speechStartedAtRef = useRef<number | null>(null);
  const advanceCooldownUntilRef = useRef(0);
  const segmentIndexRef = useRef(segmentIndex);
  const playbackStateRef = useRef(playbackState);

  segmentIndexRef.current = segmentIndex;
  playbackStateRef.current = playbackState;

  useEffect(() => {
    const now = Date.now();
    if (now < advanceCooldownUntilRef.current) {
      wasSpeakingRef.current = agentSpeaking;
      return;
    }

    if (agentSpeaking && !wasSpeakingRef.current) {
      segmentWhenSpeechStartedRef.current = segmentIndexRef.current;
      speechStartedAtRef.current = now;
    }

    if (!agentSpeaking && wasSpeakingRef.current) {
      const spokeMs =
        speechStartedAtRef.current != null
          ? now - speechStartedAtRef.current
          : 0;
      const startedAt = segmentWhenSpeechStartedRef.current;
      const idx = segmentIndexRef.current;
      const total = deck.segments.length;

      if (
        spokeMs >= MIN_SPEECH_MS &&
        playbackStateRef.current === "speaking" &&
        total > 0 &&
        startedAt !== null &&
        startedAt === idx &&
        idx < total - 1
      ) {
        advanceCooldownUntilRef.current = now + ADVANCE_COOLDOWN_MS;
        onAutoAdvance();
      }

      segmentWhenSpeechStartedRef.current = null;
      speechStartedAtRef.current = null;
    }

    wasSpeakingRef.current = agentSpeaking;
  }, [agentSpeaking, deck.segments.length, onAutoAdvance]);

  return null;
}

/**
 * Push segment `say` via SAY: when the active slide changes.
 * Segment 0 is skipped on first connect (Bey speaks it as the call greeting).
 */
function SegmentSpeechSync({
  deck,
  segmentIndex,
}: {
  deck: Deck;
  segmentIndex: number;
}) {
  const room = useRoomContext();
  const prevSegmentRef = useRef<number | null>(null);
  const deckKeyRef = useRef("");

  const key = deckKey(deck);

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

    const clamped = Math.min(
      Math.max(segmentIndex, 0),
      deck.segments.length - 1,
    );
    if (!deck.segments[clamped].say.trim()) return;

    const sendForIndex = (idx: number) => {
      const text = deck.segments[idx].say.trim();
      if (!text) return;
      void room.localParticipant
        .sendText(`SAY: ${text}`, { topic: "lk.chat" })
        .catch((err: unknown) =>
          console.warn("[tutor] avatar SAY segment failed:", err),
        );
    };

    if (prevSegmentRef.current === null) {
      if (clamped === 0) {
        prevSegmentRef.current = 0;
        return;
      }
      prevSegmentRef.current = clamped;
      sendForIndex(clamped);
      return;
    }

    if (prevSegmentRef.current === clamped) return;

    prevSegmentRef.current = clamped;
    sendForIndex(clamped);
  }, [deck, key, room, segmentIndex]);

  return null;
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
  return (
    <>
      <AvatarBridgeRegister />
      <AutoAdvanceOnSpeechEnd
        deck={deck}
        segmentIndex={segmentIndex}
        playbackState={playbackState}
        onAutoAdvance={onAutoAdvance}
      />
      <SegmentSpeechSync deck={deck} segmentIndex={segmentIndex} />
      <AvatarStage />
    </>
  );
}

type AvatarPanelProps = {
  deck: Deck | null;
  segmentIndex: number;
  playbackState: PlaybackState;
  onAutoAdvance: () => void;
  onError: (message: string | null) => void;
};

export default function AvatarPanel({
  deck,
  segmentIndex,
  playbackState,
  onAutoAdvance,
  onError,
}: AvatarPanelProps) {
  const [creds, setCreds] = useState<CreateCallResponse | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [avatarOptions, setAvatarOptions] = useState<AvatarListItem[]>([]);
  /** Set only after the learner picks a tutor photo — then LiveKit connects. */
  const [confirmedAvatarId, setConfirmedAvatarId] = useState<string | null>(
    null,
  );
  const [avatarsLoading, setAvatarsLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const activeDeckKeyRef = useRef<string>("");
  const deckKeyForReset = deckKey(deck);

  const loadAvatarCatalog = useCallback(() => {
    setAvatarsLoading(true);
    setCatalogError(null);
    return getAvatars()
      .then((data) => {
        setAvatarOptions(data.avatars);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : String(err);
        setCatalogError(message);
        setAvatarOptions([]);
      })
      .finally(() => {
        setAvatarsLoading(false);
      });
  }, []);

  useEffect(() => {
    void loadAvatarCatalog();
  }, [loadAvatarCatalog]);

  useEffect(() => {
    setConfirmedAvatarId(null);
    setCreds(null);
    activeDeckKeyRef.current = "";
  }, [deckKeyForReset]);

  const canPublishMic =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function";

  function handleConfirmAvatar(id: string) {
    writeStoredAvatarId(id);
    setConfirmedAvatarId(id);
    setCreds(null);
    activeDeckKeyRef.current = "";
    onError(null);
  }

  function handleChangeTutor() {
    setConfirmedAvatarId(null);
    setCreds(null);
    activeDeckKeyRef.current = "";
  }

  const confirmedAvatar = avatarOptions.find((a) => a.id === confirmedAvatarId);
  const showPicker =
    Boolean(deck?.segments?.length) &&
    !confirmedAvatarId &&
    !catalogError &&
    avatarOptions.length > 0;
  const showSession =
    Boolean(deck?.segments?.length) &&
    Boolean(confirmedAvatarId) &&
    Boolean(confirmedAvatar);

  useEffect(() => {
    if (!showSession || !deck?.segments?.length || !confirmedAvatarId) {
      setCreds(null);
      activeDeckKeyRef.current = "";
      return;
    }

    const key = `${confirmedAvatarId}|${deckKey(deck)}`;
    if (key === activeDeckKeyRef.current && creds) {
      return;
    }

    setCreds(null);
    activeDeckKeyRef.current = key;
    setConnecting(true);
    onError(null);

    const ctrl = new AbortController();
    provisionCallWithRetry(deck, confirmedAvatarId, ctrl.signal)
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
  }, [deck, onError, confirmedAvatarId, showSession]);

  const total = deck?.segments.length ?? 0;
  const clampedIndex =
    total === 0 ? 0 : Math.min(Math.max(segmentIndex, 0), total - 1);
  const currentSay = deck?.segments[clampedIndex]?.say ?? "";

  return (
    <section className="panel-section panel-avatar-section">
      <div className="panel-avatar-header">
        <h2 className="panel-heading panel-avatar-heading">Tutor avatar</h2>
        <div className="panel-avatar-header-actions">
            {avatarsLoading && (
            <span className="panel-avatar-current">Loading tutors…</span>
          )}
          {!avatarsLoading && confirmedAvatar && (
            <span className="panel-avatar-current">{confirmedAvatar.label}</span>
          )}
          {showSession && (
            <button
              type="button"
              className="panel-button panel-button--secondary panel-avatar-change"
              disabled={connecting}
              onClick={handleChangeTutor}
            >
              Change tutor
            </button>
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

      {showPicker && (
        <div className="panel-avatar-picker">
          <p className="panel-hint panel-avatar-picker-intro">
            Choose your tutor, then the lesson will start with live video and
            narration.
          </p>
          <div
            className="panel-avatar-picker-grid"
            role="listbox"
            aria-label="Tutor photos"
          >
            {avatarOptions.map((avatar) => (
              <AvatarPhotoCard
                key={avatar.id}
                avatar={avatar}
                selected={avatar.id === readStoredAvatarId()}
                disabled={avatarsLoading}
                onSelect={() => handleConfirmAvatar(avatar.id)}
              />
            ))}
          </div>
        </div>
      )}

      {!deck?.segments?.length && !avatarsLoading && !catalogError && (
        <p className="panel-hint panel-avatar-picker-intro">
          Start a session and pick a teaching mode to choose a tutor.
        </p>
      )}

      {showSession && (
        <div className="panel-avatar-wrap">
          <div className="panel-avatar-tile">
            {connecting && (
              <p className="panel-avatar-overlay">Connecting to tutor…</p>
            )}

            {creds && deck && (
            <LiveKitRoom
              serverUrl={creds.livekit_url}
              token={creds.livekit_token}
              connect
              audio={canPublishMic}
              video={false}
              className="panel-avatar-room"
            >
              <RoomBridge
                deck={deck}
                segmentIndex={clampedIndex}
                playbackState={playbackState}
                onAutoAdvance={onAutoAdvance}
              />
              <RoomAudioRenderer />
              <StartAudio
                label="Enable audio"
                className="panel-avatar-start-audio"
              />
            </LiveKitRoom>
            )}
          </div>
        </div>
      )}

      {currentSay && deck && showSession && creds && (
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
