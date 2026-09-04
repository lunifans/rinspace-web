import { Icon, AnimateButton} from 'components/ui';
import { useEffect, useRef, useState } from 'react';

import {
  rinStickerSrc,
  rinStickers,
  type RinSticker,
} from '@/utils/rinStickers';

type RinStickerPickerProps = {
  disabled?: boolean;
  onSelect: (sticker: RinSticker) => void;
};

export default function RinStickerPicker({
  disabled,
  onSelect,
}: RinStickerPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="rin-sticker-picker" ref={rootRef}>
      <AnimateButton unstyled
        className="comment-image-button rin-sticker-trigger"
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-label="表情"
        title="表情"
      >
        <Icon name="emoji-smile" />
        表情
      </AnimateButton>
      {open ? (
        <div className="rin-sticker-popover">
          {rinStickers.map((sticker) => (
            <AnimateButton unstyled
              type="button"
              key={sticker.id}
              onClick={() => {
                onSelect(sticker);
                setOpen(false);
              }}
              aria-label={sticker.label}
              title={sticker.label}
            >
              <img src={rinStickerSrc(sticker)} alt="" loading="lazy" />
            </AnimateButton>
          ))}
        </div>
      ) : null}
    </div>
  );
}
