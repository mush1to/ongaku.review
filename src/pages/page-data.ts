import type { PostIcon } from "../config/icons";

export interface Breadcrumb {
  label: string;
  path?: string;
}

export interface PostSummary {
  path: string;
  title: string;
  created?: string;
  icon: PostIcon;
}

export interface TaggedPost extends PostSummary {
  tags: string[];
}

export interface Thumbnail {
  src: string;
  alt: string;
}

export interface AdjacentPost {
  path: string;
  title: string;
  icon: PostIcon;
}

export interface Pagination {
  current: number;
  pages: { number: number; path: string }[];
  previous?: string;
  next?: string;
}

export interface PageData {
  kind: "home" | "page" | "404";
  path: string;
  title: string;
  description: string;
  breadcrumbs: Breadcrumb[];
  body?: string;
  created?: string;
  updated?: string;
  isPost?: boolean;
  icon?: PostIcon;
  author?: string;
  thumbnail?: Thumbnail;
  tags?: string[];
  /** `previous` is the older post and `next` the newer one. */
  adjacent?: { previous?: AdjacentPost; next?: AdjacentPost };
  posts?: PostSummary[];
  /** Every published post with its tags, so the home page can show `/#タグ名`. */
  taggedPosts?: TaggedPost[];
  pagination?: Pagination;
}
