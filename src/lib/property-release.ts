/// <reference types="astro/client" />
// Existing-site destination; no new host, proxy, or player-facing login required.
export const PROPERTY_PATH = '/properties';
export const PROPERTY_CANONICAL_URL = 'https://www.prosperitysmp.com/properties';
// Owner explicitly requested public publication on 2026-09-06. An emergency
// held build disables the page/feed/navigation; it is not artifact access control.
export const propertyDeskReleased = import.meta.env.PROPERTY_DESK_RELEASE !== 'held';
export const propertyDeskEnabled = import.meta.env.DEV || propertyDeskReleased;
