import type { SVGProps } from "react";

type IconName = "route" | "package" | "arrow" | "locate" | "search" | "logout";
const paths: Record<IconName, string> = {
  route: "M5 6h11a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h11M5 3v6m14 6v6",
  package: "m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8m-9 5v9M7 6l9 5",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  locate: "M12 2v3m0 14v3M2 12h3m14 0h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  search: "M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM16 16l5 5",
  logout: "M9 4H4v16h5m5-13 5 5-5 5M9 12h10",
};

export default function InterfaceIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}><path d={paths[name]} /></svg>;
}
