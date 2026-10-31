import type { IconName } from "./icons";

export interface NavigationLink {
  path: string;
  label: string;
  icon: IconName;
}

const navigation: readonly NavigationLink[] = [
  { path: "/", label: "Home", icon: "house" },
  { path: "/about", label: "About", icon: "information" },
];

const statusBar = {
  objects: (count: number) => `${count} 個のオブジェクト`,
  updated: (date: string) => `更新日時: ${date}`,
  created: (date: string) => `作成日時: ${date}`,
  readingTime: (minutes: number) => `読了目安: 約 ${minutes} 分`,
  opening: "開いています...",
};

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
  statusBar,
};
