import type { ContentType } from '@/services/contracts';

export type RinPageContextComment = {
  id: number;
  author: string;
  body: string;
  voteCount?: number;
  replyToAuthor?: string;
};

export type RinPageContextAnswer = {
  id: number;
  author: string;
  body: string;
  accepted?: boolean;
  voteCount?: number;
  comments?: RinPageContextComment[];
};

export type RinPageContextDraft = {
  label: string;
  body: string;
};

export type RinPageContextSection = {
  title: string;
  body: string;
};

export type RinPageContextSnapshot = {
  kind: ContentType | 'page' | 'tag';
  id?: string;
  slug?: string;
  title: string;
  author?: string;
  tags?: string[];
  body?: string;
  excerpt?: string;
  comments?: RinPageContextComment[];
  answers?: RinPageContextAnswer[];
  drafts?: RinPageContextDraft[];
  sections?: RinPageContextSection[];
  updatedAt?: string;
};

declare global {
  interface Window {
    __rinspacePageContext?: RinPageContextSnapshot;
    __rinspaceBuildPageContext?: () => RinPageContextSnapshot | undefined;
  }
}

export {};
