import { useMemo, useState } from "react";
import type { AvatarListItem } from "../shared/apiTypes";
import {
  avatarInitials,
  resolveAvatarImageCandidates,
} from "../lib/resolveAvatarImage";

type AvatarPhotoCardProps = {
  avatar: AvatarListItem;
  selected?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export default function AvatarPhotoCard({
  avatar,
  selected = false,
  disabled = false,
  onSelect,
}: AvatarPhotoCardProps) {
  const candidates = useMemo(
    () => resolveAvatarImageCandidates(avatar),
    [avatar],
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const src =
    candidateIndex < candidates.length ? candidates[candidateIndex] : null;
  const showInitials =
    candidates.length === 0 || candidateIndex >= candidates.length;

  return (
    <button
      type="button"
      className={[
        "panel-avatar-picker-card",
        selected ? "panel-avatar-picker-card--selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Select tutor ${avatar.label}`}
    >
      <span className="panel-avatar-picker-photo">
        {!showInitials && src ? (
          <img
            src={src}
            alt=""
            className="panel-avatar-picker-img"
            onError={() => {
              setCandidateIndex((i) => i + 1);
            }}
          />
        ) : (
          <span className="panel-avatar-picker-fallback" aria-hidden>
            {avatarInitials(avatar.label)}
          </span>
        )}
      </span>
      <span className="panel-avatar-picker-name">{avatar.label}</span>
    </button>
  );
}
