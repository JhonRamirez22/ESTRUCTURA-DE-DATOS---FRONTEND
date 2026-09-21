export interface LiveScore {
  totalMinutes: number;
  longestMinutes: number;
  balance: number;
  crossings: number;
  lowerBoundGap: number | null;
}

export interface LiveRouteProposal {
  routeId: string;
  changed: boolean;
  currentOrder: string[];
  proposedOrder: string[];
  movedIn: string[];
  movedOut: string[];
  currentMinutes: number | null;
  proposedMinutes: number | null;
  savedMinutes: number;
  geometry: { type: 'LineString'; coordinates: Array<[number, number]> } | null;
}

export interface LiveMove {
  stopId: string;
  fromRouteId: string;
  toRouteId: string;
  gainMinutes: number;
}
