export type CreatorPageState = 'draft' | 'published';
export type CreatorSourceVisibility = 'private' | 'open';

export type CreatorPublicationProjection = {
  publishStatus?: string;
  repositoryStatus?: string;
  sourceVisibility?: string;
};

export function creatorPageState(item: CreatorPublicationProjection): CreatorPageState {
  if (item.repositoryStatus === 'draft' || item.repositoryStatus === 'published') {
    return item.repositoryStatus;
  }
  return item.publishStatus === 'draft' ? 'draft' : 'published';
}

export function creatorSourceVisibility(item: CreatorPublicationProjection): CreatorSourceVisibility {
  if (item.sourceVisibility === 'open' || item.sourceVisibility === 'private') {
    return item.sourceVisibility;
  }
  if (item.repositoryStatus === 'published') return 'open';
  return item.publishStatus === 'published' ? 'open' : 'private';
}

export function contentStatusForCreatorControls(
  pageState: CreatorPageState,
  sourceVisibility: CreatorSourceVisibility,
): 'draft' | 'private' | 'published' {
  if (pageState === 'draft') return 'draft';
  return sourceVisibility === 'open' ? 'published' : 'private';
}
