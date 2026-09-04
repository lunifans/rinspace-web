import {
  AnimateButton,
  Dialog,
  DialogBody,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  Icon,
} from 'components/ui';
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useState,
} from 'react';

import { useOptionalBootstrap } from '@/app/bootstrap/context';
import ImageCropDialog from '@/components/ImageCropDialog';
import TagPicker from '@/components/TagPicker';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { updateContent } from '@/services/domains/article';
import { messageFromError } from '@/services/errors';
import type { PostDetail } from '@/services/feed';
import type { CloudUser } from '@/services/phoneAuth';
import { uploadCoverFile } from '@/services/profile';

import './publish-dialog.css';

type PendingCoverCrop = {
  imageUrl: string;
  fileName: string;
};

type BookProfileDialogProps = {
  open: boolean;
  post: PostDetail | null;
  user: CloudUser | null;
  onClose(): void;
  onSaved(post: PostDetail): void;
};

export default function BookProfileDialog({ open, post, user, onClose, onSaved }: BookProfileDialogProps) {
  const bootstrap = useOptionalBootstrap();
  const { t } = useFeatureTranslation('creation');
  const demoMode = bootstrap?.config.mode === 'demo';
  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [coverUrl, setCoverUrl] = useState('');
  const [pendingCoverCrop, setPendingCoverCrop] = useState<PendingCoverCrop | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!open || !post) return;
    setTitle(post.title || '');
    setExcerpt(post.excerpt || '');
    setTags(post.tags || []);
    setCoverUrl(post.coverUrl || '');
    setPendingCoverCrop(null);
    setCoverUploading(false);
    setSaving(false);
    setError('');
    setNotice('');
  }, [open, post]);

  const busy = saving || coverUploading;

  const closeDialog = () => {
    if (busy) return;
    if (pendingCoverCrop) {
      URL.revokeObjectURL(pendingCoverCrop.imageUrl);
      setPendingCoverCrop(null);
    }
    onClose();
  };

  const changeCover = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('publishDialog.cover.imageOnly'));
      return;
    }
    if (pendingCoverCrop) {
      URL.revokeObjectURL(pendingCoverCrop.imageUrl);
    }
    setError('');
    setNotice('');
    setPendingCoverCrop({
      imageUrl: URL.createObjectURL(file),
      fileName: file.name || 'book-cover.jpg',
    });
  };

  const closeCoverCrop = () => {
    if (coverUploading) return;
    if (pendingCoverCrop) {
      URL.revokeObjectURL(pendingCoverCrop.imageUrl);
      setPendingCoverCrop(null);
    }
  };

  const uploadCroppedCover = async (file: File) => {
    if (!user || !pendingCoverCrop) return;
    setCoverUploading(true);
    setError('');
    setNotice(t('publishDialog.cover.uploading'));
    try {
      const uploaded = demoMode && bootstrap
        ? await bootstrap.ports.uploads.upload({ name: file.name, type: file.type, bytes: file })
        : await uploadCoverFile(user, file);
      setCoverUrl('fileID' in uploaded ? uploaded.fileID : uploaded.url);
      setNotice(t('publishDialog.cover.uploaded'));
      URL.revokeObjectURL(pendingCoverCrop.imageUrl);
      setPendingCoverCrop(null);
    } catch (uploadError) {
      setError(messageFromError(uploadError, 'creation.coverUploadFailed'));
      setNotice('');
    } finally {
      setCoverUploading(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!post || !user || saving) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t('publishDialog.bookProfile.titleRequired'));
      return;
    }
    setSaving(true);
    setError('');
    setNotice(t('publishDialog.bookProfile.saving'));
    try {
      const saved = await updateContent(post.slug || post.id, {
        type: 'book',
        title: trimmedTitle,
        body: post.body,
        excerpt: excerpt.trim(),
        tags: tags.slice(0, 6),
        coverUrl,
        book: {
          ...(post.book || { kind: 'original' as const, bookTitle: trimmedTitle, authors: [] }),
          bookTitle: trimmedTitle,
        },
      });
      if (saved.publicationPending) {
        setNotice(t('publishDialog.bookProfile.activationPending'));
        onSaved(saved);
        setSaving(false);
        return;
      }
      setNotice(t('publishDialog.bookProfile.saved'));
      onSaved(saved);
      onClose();
    } catch (saveError) {
      setError(messageFromError(saveError, 'creation.bookProfileSaveFailed'));
      setNotice('');
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) closeDialog(); }}>
      <DialogPortal>
        <DialogOverlay className="rin-ui-overlay" />
        <DialogBody
          className="auth-dialog latex-blog-dialog publish-create-dialog"
          aria-describedby={undefined}
        >
          <div className="auth-dialog-head">
            <DialogTitle className="auth-dialog-title">
              {t('publishDialog.bookProfile.title')}
            </DialogTitle>
            <DialogClose asChild>
              <AnimateButton
                unstyled
                type="button"
                aria-label={t('publishDialog.bookProfile.close')}
                disabled={busy}
              >
                <Icon name="x-lg" />
              </AnimateButton>
            </DialogClose>
          </div>
          <form className="auth-dialog-form latex-blog-dialog-form" onSubmit={submit}>
            <label>
              <span>{t('publishDialog.fields.title')}</span>
              <input
                type="text"
                value={title}
                maxLength={120}
                disabled={saving}
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
            </label>
            <label>
              <span>{t('publishDialog.fields.excerpt')}</span>
              <textarea
                value={excerpt}
                maxLength={240}
                rows={3}
                disabled={saving}
                onChange={(event) => setExcerpt(event.currentTarget.value)}
              />
            </label>
            <div className="latex-blog-field">
              <span>{t('publishDialog.fields.tags')}</span>
              <TagPicker
                value={tags}
                disabled={saving}
                max={6}
                placeholder={t('publishDialog.fields.tagPlaceholder')}
                createMode="add"
                onChange={setTags}
              />
            </div>
            <div className="latex-blog-cover-row">
              <div className="latex-blog-cover-preview publish-dialog-book-cover">
                {coverUrl ? <img src={coverUrl} alt="" /> : <span>2:3</span>}
              </div>
              <label className="latex-blog-cover-upload">
                <Icon name="image" />
                <span>
                  {coverUrl
                    ? t('publishDialog.cover.replace')
                    : t('publishDialog.cover.upload')}
                </span>
                <input type="file" accept="image/*" disabled={busy} onChange={changeCover} />
              </label>
              {coverUrl ? (
                <AnimateButton
                  unstyled
                  type="button"
                  className="latex-blog-cover-remove"
                  disabled={busy}
                  onClick={() => setCoverUrl('')}
                >
                  {t('publishDialog.cover.remove')}
                </AnimateButton>
              ) : null}
            </div>
            {error ? <p className="auth-dialog-error" role="alert">{error}</p> : null}
            {notice ? (
              <p className="auth-dialog-status" role="status" aria-live="polite">
                {notice}
              </p>
            ) : null}
            <div className="auth-dialog-actions">
              <AnimateButton unstyled type="button" className="auth-dialog-link" disabled={busy} onClick={closeDialog}>
                {t('common:actions.cancel')}
              </AnimateButton>
              <AnimateButton unstyled type="submit" disabled={busy}>
                {saving
                  ? t('publishDialog.bookProfile.savingAction')
                  : t('publishDialog.bookProfile.saveAction')}
              </AnimateButton>
            </div>
          </form>
        </DialogBody>
      </DialogPortal>
      {pendingCoverCrop ? (
        <ImageCropDialog
          open
          imageUrl={pendingCoverCrop.imageUrl}
          title={t('publishDialog.cover.cropBook')}
          aspect={2 / 3}
          cropShape="rect"
          outputWidth={900}
          outputHeight={1350}
          outputFileName={pendingCoverCrop.fileName}
          busy={coverUploading}
          onCancel={closeCoverCrop}
          onConfirm={uploadCroppedCover}
        />
      ) : null}
    </Dialog>
  );
}
