export interface NavLink {
  label: string;
  href: string;
}

export const primaryNav: NavLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Getting Started', href: '/getting-started' },
  { label: 'Commands', href: '/commands' },
  { label: 'Rules', href: '/rules' },
  { label: 'Economy', href: '/economy' },
  { label: 'Skill Trees', href: '/skill-trees' },
  { label: 'Laws', href: '/laws' },
  { label: 'Contracts', href: '/contracts' },
  { label: 'Changelog', href: '/changelog' },
];

export const footerNav: NavLink[] = [
  { label: 'Getting Started', href: '/getting-started' },
  { label: 'Commands', href: '/commands' },
  { label: 'Rules', href: '/rules' },
  { label: 'Economy', href: '/economy' },
  { label: 'Laws', href: '/laws' },
  { label: 'Contracts', href: '/contracts' },
  // /faq is linked from the homepage and from Getting Started, so it isn't
  // orphaned. Kept out of primaryNav so the desktop header still fits at the
  // lg breakpoint.
  { label: 'FAQ', href: '/faq' },
  { label: 'Changelog', href: '/changelog' },
];
