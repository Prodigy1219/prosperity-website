import catalog from '../../data/property-catalog.json';
import { propertyDeskEnabled } from '../../lib/property-release';
export function GET() {
  if (!propertyDeskEnabled) {
    return new Response(JSON.stringify({error:'Property Desk is not released'}),{status:404});
  }
  return new Response(JSON.stringify(catalog),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
}
