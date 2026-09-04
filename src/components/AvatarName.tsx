import AvatarImage from './AvatarImage';
import CultivationBadge from './CultivationBadge';

export type AvatarNameSize = 'sm' | 'md';

export type AvatarNameProps = {
  name: string;
  imageUrl?: string;
  rank?: number;
  size?: AvatarNameSize;
};

function initialsFor(name: string) {
  const normalized = name.trim();
  if (!normalized) return 'R';
  const letters = Array.from(normalized.replace(/\s+/g, ''));
  return letters.slice(0, 2).join('').toUpperCase();
}

function toneFor(name: string) {
  const tones = ['green', 'rust', 'ink'];
  const code = Array.from(name).reduce((total, char) => total + char.charCodeAt(0), 0);
  return tones[code % tones.length];
}

export default function AvatarName({
  name,
  imageUrl,
  rank,
  size = 'sm',
}: AvatarNameProps) {
  const label = name.trim() || 'Rinspace';

  return (
    <span className={`avatar-name avatar-name-${size}`}>
      <span className={`avatar-name-mark tone-${toneFor(label)}`} aria-hidden="true">
        <AvatarImage src={imageUrl} fallback={initialsFor(label)} />
      </span>
      <span className="avatar-name-text">{label}</span>
      <CultivationBadge rank={rank} />
    </span>
  );
}
