export type PlexServer = {
  name: string;
  address: string; // base URL, e.g., http://localhost:32400
  machineIdentifier?: string;
  owned?: boolean;
};

export type PlexLibrary = {
  key: string; // section id
  type: "movie" | "show" | "artist" | string;
  title: string;
  roots?: string[];
};
