import type { IAgoraRTCClient, ILocalAudioTrack, ILocalVideoTrack } from 'agora-rtc-sdk-ng';

/**
 * Agora Service State Machine States
 */
export enum AgoraServiceState {
  IDLE = 'IDLE',
  INITIALIZING = 'INITIALIZING',
  JOINING = 'JOINING',
  JOINED = 'JOINED',
  READY = 'READY',
  PUBLISHING = 'PUBLISHING',
  PUBLISHED = 'PUBLISHED',
  ERROR = 'ERROR',
  RECONNECTING = 'RECONNECTING',
}

/**
 * Agora Connection State (from SDK)
 */
export type AgoraConnectionState = 
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'DISCONNECTING';

/**
 * Operation types that can be queued
 */
export enum OperationType {
  JOIN = 'JOIN',
  PUBLISH_VIDEO = 'PUBLISH_VIDEO',
  PUBLISH_AUDIO = 'PUBLISH_AUDIO',
  UNPUBLISH_VIDEO = 'UNPUBLISH_VIDEO',
  UNPUBLISH_AUDIO = 'UNPUBLISH_AUDIO',
  LEAVE = 'LEAVE',
}

/**
 * Queued operation
 */
export interface QueuedOperation {
  type: OperationType;
  payload?: any;
  retryCount?: number;
  timestamp: number;
}

/**
 * Error classification
 */
export enum ErrorType {
  NETWORK = 'NETWORK',
  PERMISSION = 'PERMISSION',
  SDK = 'SDK',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Service error with classification
 */
export interface ServiceError {
  type: ErrorType;
  message: string;
  code?: string | number;
  originalError?: any;
  recoverable: boolean;
}

/**
 * State change event
 */
export interface StateChangeEvent {
  previousState: AgoraServiceState;
  newState: AgoraServiceState;
  error?: ServiceError;
}

/**
 * Remote user published event
 */
export interface RemoteUserPublishedEvent {
  uid: string;
  mediaType: 'audio' | 'video';
  user: any; // Agora RemoteUser type
}

/**
 * Remote user unpublished event
 */
export interface RemoteUserUnpublishedEvent {
  uid: string;
  user: any; // Agora RemoteUser type
}

/**
 * Reconnection event
 */
export interface ReconnectionEvent {
  attempt: number;
  maxAttempts: number;
  nextRetryDelay: number;
}

/**
 * Service configuration
 */
export interface AgoraServiceConfig {
  appId: string;
  token?: string | null;
  codec?: 'vp8' | 'vp9' | 'h264';
  mode?: 'live' | 'rtc';
  maxReconnectAttempts?: number;
  reconnectBackoffBase?: number;
  reconnectBackoffMax?: number;
}

/**
 * Callback types
 */
export type StateChangeCallback = (event: StateChangeEvent) => void;
export type RemoteUserPublishedCallback = (event: RemoteUserPublishedEvent) => void;
export type RemoteUserUnpublishedCallback = (event: RemoteUserUnpublishedEvent) => void;
export type ReconnectionCallback = (event: ReconnectionEvent) => void;
export type ErrorCallback = (error: ServiceError) => void;

/**
 * Track references
 */
export interface TrackReferences {
  audioTrack?: ILocalAudioTrack;
  videoTrack?: ILocalVideoTrack;
}



