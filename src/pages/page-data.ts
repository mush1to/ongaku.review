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

export interface Thumbnail {
  src: string;
}

export interface AuthorLink {
  kind: "x" | "website";
  url: string;
  /** Accessible name of the icon-only link. */
  label: string;
}

export interface Author {
  name: string;
  description: string;
  /** Image URL. Undefined when the user has no icon. */
  icon?: string;
  links: AuthorLink[];
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
  kind: "home" | "tag" | "page" | "404";
  path: string;
  title: string;
  description: string;
  breadcrumbs: Breadcrumb[];
  body?: string;
  created?: string;
  updated?: string;
  isPost?: boolean;
  author?: Author;
  thumbnail?: Thumbnail;
  tags?: string[];
  /** `previous` is the older post and `next` the newer one. */
  adjacent?: { previous?: AdjacentPost; next?: AdjacentPost };
  posts?: PostSummary[];
  tag?: string;
  pagination?: Pagination;
}
