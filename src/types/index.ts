export type NodeId = string & { readonly __brand: unique symbol }

export function nodeId(id: string): NodeId {
  return id as NodeId
}

export interface Coordinates {
  lat: number
  lng: number
}

export interface Edge<T = unknown> {
  target: NodeId
  weight: number
  data?: T
}

export interface GraphNode<T = unknown> {
  id: NodeId
  coordinates: Coordinates
  data?: T
}

export type GraphAdjacencyList<T = unknown> = Map<NodeId, Edge<T>[]>

export interface RouteResult {
  path: NodeId[]
  totalCost: number
}

export interface TSPInput {
  stops: NodeId[]
  timeMatrix: number[][]
  startIndex?: number
}

export interface TSPResult {
  orderedStops: NodeId[]
  totalTime: number
}

export interface OrderQueueItem {
  id: string
  coordinates: Coordinates
  priority: number
  createdAt: Date
}

export type OrderStatus = 'pending' | 'assigned' | 'in_progress' | 'delivered' | 'failed'

export type DriverStatus = 'available' | 'on_route' | 'offline'

export interface Driver {
  id: string
