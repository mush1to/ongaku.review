const directory = "/icons/silk/";

export const icons = {
  house: directory + "house.svg",
  information: directory + "information.svg",
  magnifier: directory + "magnifier.svg",
  folder: directory + "folder.svg",
  document: directory + "page-white-text.svg",
  music: directory + "music.svg",
  cd: directory + "cd.svg",
  world: directory + "world.svg",
} as const;

export type IconName = keyof typeof icons;

export const postIcons = ["document", "music", "cd"] as const satisfies readonly IconName[];

export type PostIcon = (typeof postIcons)[number];

export const defaultPostIcon: PostIcon = "document";

export const isPostIcon = (value: unknown): value is PostIcon =>
  (postIcons as readonly unknown[]).includes(value);
