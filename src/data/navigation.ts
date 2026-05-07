export interface NavLink {
  label: string;
  href: string;
}

export const primaryNav: NavLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Getting Started', href: '/getting-started' },
  { label: 'Rules', href: '/rules' },
  { label: 'Economy', href: '/economy' },
  { label: 'Skill Trees', href: '/skill-trees' },
  { label: 'Laws', href: '/laws' },
  { label: 'Changelog', href: '/changelog' },
];

export const footerNav: NavLink[] = [
  { label: 'Rules', href: '/rules' },
  { label: 'Economy', href: '/economy' },
  { label: 'Getting Started', href: '/getting-started' },
  { label: 'Laws', href: '/laws' },
  { label: 'Changelog', href: '/changelog' },
];
