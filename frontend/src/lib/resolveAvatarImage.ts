import type { AvatarListItem } from "../shared/apiTypes";

/** Tried in order under extension `public/avatars/{id}{ext}` (Option A). */
const EXTENSION_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".svg"];

/** Resolve picker photo: API image_url, then extension public/avatars/{id}.* */
export function resolveAvatarImageCandidates(
  avatar: AvatarListItem,
): string[] {
  const urls: string[] = [];
  if (avatar.image_url) {
    urls.push(avatar.image_url);
  }
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    for (const ext of EXTENSION_EXTENSIONS) {
      urls.push(chrome.runtime.getURL(`avatars/${avatar.id}${ext}`));
    }
  }
  return urls;
}

export function avatarInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}
