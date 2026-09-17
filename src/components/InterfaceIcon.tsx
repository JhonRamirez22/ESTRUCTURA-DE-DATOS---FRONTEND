import type { SVGProps } from "react";

type IconName = "route" | "package" | "arrow" | "locate" | "search" | "logout" | "users";
const paths: Record<IconName, string> = {
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10v-1a6 6 0 0 1 12 0v1m2-10a3 3 0 1 0 0-6m6 16v-1a5 5 0 0 0-3.5-4.8",
  route: "M5 6h11a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h11M5 3v6m14 6v6",
  package: "m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8m-9 5v9M7 6l9 5",
  arrow: "M4 12h16m-6-6 6 6-6 6",
