import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
}

export function FolderIcon(props: IconProps) { return <Icon {...props}><path d="M3.5 6.5h6l2 2h9v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" /><path d="M3.5 8.5V6a2 2 0 0 1 2-2H9l2 2h7.5a2 2 0 0 1 2 2v.5" /></Icon>; }
export function ChevronIcon(props: IconProps) { return <Icon {...props}><path d="m9 5 7 7-7 7" /></Icon>; }
export function SearchIcon(props: IconProps) { return <Icon {...props}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></Icon>; }
export function ExplorerIcon(props: IconProps) { return <Icon {...props}><path d="M4 5.5h6l1.7 2H20v11H4Z" /><path d="M4 9h16" /></Icon>; }
export function RecentIcon(props: IconProps) { return <Icon {...props}><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="7" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="7" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="7" cy="18" r="1" fill="currentColor" stroke="none" /></Icon>; }
export function ConversationIcon(props: IconProps) { return <Icon {...props}><path d="M5 5h14v10H9l-4 4Z" /><path d="M8 9h8M8 12h5" /></Icon>; }
export function OpenIcon(props: IconProps) { return <Icon {...props}><path d="M8 5h11v11" /><path d="m19 5-9 9" /><path d="M16 13v6H5V8h6" /></Icon>; }
export function InfoIcon(props: IconProps) { return <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 10v6" /><path d="M12 7h.01" /></Icon>; }
