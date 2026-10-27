import type { IconName } from "./icons";

export interface NavigationLink {
  path: string;
  label: string;
  icon: IconName;
}

export const searchPath = "/search/";

const navigation: readonly NavigationLink[] = [
  { path: "/", label: "Home", icon: "house" },
  { path: "/about/", label: "About", icon: "information" },
  { path: searchPath, label: "Search", icon: "magnifier" },
];

export const site = {
  title: "ongaku.review",
  name: "ongaku.review",
  url: "https://ongaku.review",
  description: "音楽が好き。",
  author: "mush1to",
  themeStorageKey: "ongaku.review.theme",
  themeColor: "#0b55e0",
  postsPerPage: 12,
  navigation,
};
