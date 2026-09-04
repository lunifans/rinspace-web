import type { CSSProperties } from 'react';
import { motion } from 'motion/react';

export interface AvatarIdentity { name: string; initials: string; tone?: string }

/** Compact identity composition adapted from pinned Animate UI Avatar Group. */
export function AnimateAvatarGroup({ identities, label }: { identities: AvatarIdentity[]; label: string }) {
  return (
    <div className="rin-animate-avatar-group" aria-label={label}>
      {identities.map((identity, index) => (
        <motion.span
          className="rin-animate-avatar"
          key={identity.name}
          style={{ '--rin-avatar-tone': identity.tone ?? 'var(--rin-accent)', zIndex: identities.length - index } as CSSProperties}
          title={identity.name}
          whileHover={{ y: -4, zIndex: identities.length + 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
        >
          {identity.initials}
        </motion.span>
      ))}
    </div>
  );
}
