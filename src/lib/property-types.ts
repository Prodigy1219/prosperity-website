export type PropertyStatus='available'|'owned'|'leased'|'unknown';
export interface Property {
  id:string;region:string;world:string;worldId:string;tenure:'buy'|'rent';status:PropertyStatus;
  kind:string;tags:string[];priceCents:number|null;priceBasis:'static'|'per_m2'|'per_m3'|'unverified';
  periodSeconds:number|null;leaseEndsAt:string|null;owner:{id:string;name:string}|null;
  geometry:{points:[number,number][];minY:number;maxY:number};mapId:string|null;
  history:{id:string;type:'purchase'|'rent'|'extend'|'sellback';at:string;amountCents:number|null;source:string}[];
  preview:{url:string;capturedAt:string}|null;notes:string[];
}
export interface PropertyCatalog {schemaVersion:1;observedAt:string;expiresAt:string;properties:Property[];source:string}
export interface PropertyFilters {query?:string;world?:string;tenure?:string;status?:string;tag?:string;saved?:string[]|null;maxCost?:number|null;sort?:string}
