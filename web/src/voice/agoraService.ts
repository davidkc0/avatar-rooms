import AgoraRTC, { type IAgoraRTCClient, type ConnectionState } from 'agora-rtc-sdk-ng';
import {
  AgoraServiceState,
  OperationType,
  ErrorType,
  type QueuedOperation,
  type ServiceError,
  type StateChangeEvent,
  type RemoteUserPublishedEvent,
  type RemoteUserUnpublishedEvent,
  type ReconnectionEvent,
  type AgoraServiceConfig,
  type StateChangeCallback,
  type RemoteUserPublishedCallback,
  type RemoteUserUnpublishedCallback,
  type ReconnectionCallback,
  type ErrorCallback,
  type TrackReferences,
} from './types';

const DEFAULT_CONFIG: Required<AgoraServiceConfig> = {
  appId: import.meta.env.VITE_AGORA_APP_ID || '',
  token: import.meta.env.VITE_AGORA_TEMP_TOKEN || null,
  codec: 'h264',
  mode: 'rtc',
  maxReconnectAttempts: 5,
  reconnectBackoffBase: 1000,
  reconnectBackoffMax: 30000,
};

/**
 * AgoraService - Centralized service managing Agora lifecycle with state machine
 */
export class AgoraService {
  private state: AgoraServiceState = AgoraServiceState.IDLE;
  private client: IAgoraRTCClient | null = null;
  private config: Required<AgoraServiceConfig>;
  private tracks: TrackReferences = {};
  private operationQueue: QueuedOperation[] = [];
  private isProcessingQueue = false;
  private eventHandlers: Map<string, (...args: any[]) => void> = new Map();
  
  // Reconnection state
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingReconnect: { uid: string; roomCode: string } | null = null;
  
  // Event callbacks
  private stateChangeCallbacks: Set<StateChangeCallback> = new Set();
  private remoteUserPublishedCallbacks: Set<RemoteUserPublishedCallback> = new Set();
  private remoteUserUnpublishedCallbacks: Set<RemoteUserUnpublishedCallback> = new Set();
  private reconnectionCallbacks: Set<ReconnectionCallback> = new Set();
  private errorCallbacks: Set<ErrorCallback> = new Set();
  
  // Current session info
  private currentUid: string | null = null;
  private currentRoomCode: string | null = null;

  constructor(config?: Partial<AgoraServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (!this.config.appId) {
      console.warn('[AgoraService] No Agora App ID configured');
    }
  }

  /**
   * Get current state
   */
  getState(): AgoraServiceState {
    return this.state;
  }

  /**
   * Get current client (if initialized)
   */
  getClient(): IAgoraRTCClient | null {
    return this.client;
  }

  /**
   * Get current tracks
   */
  getTracks(): TrackReferences {
    return { ...this.tracks };
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this.stateChangeCallbacks.add(callback);
    return () => {
      this.stateChangeCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to remote user published events
   */
  onRemoteUserPublished(callback: RemoteUserPublishedCallback): () => void {
    this.remoteUserPublishedCallbacks.add(callback);
    return () => {
      this.remoteUserPublishedCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to remote user unpublished events
   */
  onRemoteUserUnpublished(callback: RemoteUserUnpublishedCallback): () => void {
    this.remoteUserUnpublishedCallbacks.add(callback);
    return () => {
      this.remoteUserUnpublishedCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to reconnection events
   */
  onReconnection(callback: ReconnectionCallback): () => void {
    this.reconnectionCallbacks.add(callback);
    return () => {
      this.reconnectionCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to errors
   */
  onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.add(callback);
    return () => {
      this.errorCallbacks.delete(callback);
    };
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: AgoraServiceState, error?: ServiceError): void {
    if (this.state === newState) {
      return;
    }

    const previousState = this.state;
    this.state = newState;

    const event: StateChangeEvent = {
      previousState,
      newState,
      error,
    };

    console.log(`[AgoraService] State transition: ${previousState} → ${newState}`, error ? { error } : '');

    // Notify all callbacks
    this.stateChangeCallbacks.forEach((callback) => {
      try {
        callback(event);
      } catch (err) {
        console.error('[AgoraService] Error in state change callback', err);
      }
    });

    // Process queue when entering READY state
    if (newState === AgoraServiceState.READY) {
      this.processOperationQueue();
    }
  }

  /**
   * Emit error
   */
  private emitError(error: ServiceError): void {
    console.error('[AgoraService] Error:', error);
    this.errorCallbacks.forEach((callback) => {
      try {
        callback(error);
      } catch (err) {
        console.error('[AgoraService] Error in error callback', err);
      }
    });
  }

  /**
   * Classify error
   */
  private classifyError(error: any): ServiceError {
    const message = error?.message || String(error);
    const code = error?.code;

    // Network errors
    if (
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      code === 'NETWORK_ERROR'
    ) {
      return {
        type: ErrorType.NETWORK,
        message,
        code,
        originalError: error,
        recoverable: true,
      };
    }

    // Permission errors
    if (
      message.includes('permission') ||
      message.includes('denied') ||
      code === 'PERMISSION_DENIED'
    ) {
      return {
        type: ErrorType.PERMISSION,
        message,
        code,
        originalError: error,
        recoverable: false,
      };
    }

    // SDK errors
    if (code === 'INVALID_OPERATION' || code === 'INVALID_PARAMETER') {
      return {
        type: ErrorType.SDK,
        message,
        code,
        originalError: error,
        recoverable: true,
      };
    }

    return {
      type: ErrorType.UNKNOWN,
      message,
      code,
      originalError: error,
      recoverable: true,
    };
  }

  /**
   * Queue an operation
   */
  private queueOperation(operation: QueuedOperation): void {
    this.operationQueue.push(operation);
    console.log(`[AgoraService] Queued operation: ${operation.type}`, this.operationQueue.length, 'operations in queue');
    
    // Try to process if we're in a state that allows it
    if (this.state === AgoraServiceState.READY || this.state === AgoraServiceState.PUBLISHED) {
      this.processOperationQueue();
    }
  }

  /**
   * Process operation queue
   */
  private async processOperationQueue(): Promise<void> {
    if (this.isProcessingQueue || this.operationQueue.length === 0) {
      return;
    }

    // Only process queue when in READY or PUBLISHED state
    if (this.state !== AgoraServiceState.READY && this.state !== AgoraServiceState.PUBLISHED) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.operationQueue.length > 0) {
      const operation = this.operationQueue.shift()!;
      
      try {
        await this.executeOperation(operation);
      } catch (error) {
        const serviceError = this.classifyError(error);
        console.error(`[AgoraService] Operation ${operation.type} failed:`, serviceError);
        
        // Retry recoverable errors
        if (serviceError.recoverable && (!operation.retryCount || operation.retryCount < 3)) {
          operation.retryCount = (operation.retryCount || 0) + 1;
          this.operationQueue.unshift(operation);
          console.log(`[AgoraService] Retrying operation ${operation.type} (attempt ${operation.retryCount})`);
        } else {
          this.emitError(serviceError);
        }
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Execute a queued operation
   */
  private async executeOperation(operation: QueuedOperation): Promise<void> {
    console.log(`[AgoraService] Executing operation: ${operation.type}`);
    
    switch (operation.type) {
      case OperationType.PUBLISH_VIDEO:
        await this.doPublishVideo(operation.payload);
        break;
      case OperationType.PUBLISH_AUDIO:
        await this.doPublishAudio();
        break;
      case OperationType.UNPUBLISH_VIDEO:
        await this.doUnpublishVideo();
        break;
      case OperationType.UNPUBLISH_AUDIO:
        await this.doUnpublishAudio();
        break;
      default:
        console.warn(`[AgoraService] Unknown operation type: ${operation.type}`);
    }
  }

  /**
   * Initialize and start connection process
   */
  async initialize(uid: string, roomCode: string): Promise<void> {
    // If already initialized with same uid/room, do nothing
    if (this.currentUid === uid && this.currentRoomCode === roomCode) {
      if (this.state === AgoraServiceState.READY || this.state === AgoraServiceState.PUBLISHED) {
        console.log('[AgoraService] Already initialized and ready');
        return;
      }
      if (this.state === AgoraServiceState.JOINING || this.state === AgoraServiceState.INITIALIZING) {
        console.log('[AgoraService] Already initializing, waiting...');
        return;
      }
    }

    // If in a different state, cleanup first
    if (this.state !== AgoraServiceState.IDLE && this.state !== AgoraServiceState.ERROR) {
      console.warn(`[AgoraService] Reinitializing from state: ${this.state}, cleaning up first`);
      await this.leave();
    }

    this.currentUid = uid;
    this.currentRoomCode = roomCode;
    this.transitionTo(AgoraServiceState.INITIALIZING);

    try {
      await this.createClient();
      await this.joinChannel(uid, roomCode);
    } catch (error) {
      const serviceError = this.classifyError(error);
      this.transitionTo(AgoraServiceState.ERROR, serviceError);
      this.emitError(serviceError);
      throw error;
    }
  }

  /**
   * Create Agora client
   */
  private async createClient(): Promise<void> {
    if (this.client) {
      return;
    }

    if (!this.config.appId) {
      throw new Error('Agora App ID is required');
    }

    this.client = AgoraRTC.createClient({
      mode: this.config.mode,
      codec: this.config.codec,
    });

    this.setupEventListeners();
  }

  /**
   * Setup Agora SDK event listeners
   */
  private setupEventListeners(): void {
    if (!this.client) return;

    // Connection state change - PRIMARY signal for when Agora is ready
    const connectionStateHandler = (curState: ConnectionState, revState: ConnectionState) => {
      console.log(`[AgoraService] Connection state: ${revState} → ${curState}`);
      
      // Check if client still exists
      if (!this.client) {
        console.warn('[AgoraService] Client is null during connection state change');
        return;
      }
      
      switch (curState) {
        case 'CONNECTED':
          // Only transition to READY if we're in JOINING state (join promise resolved but waiting for connection)
          // Don't transition if already READY or PUBLISHED
          if (this.state === AgoraServiceState.JOINING) {
            this.transitionTo(AgoraServiceState.READY);
          }
          this.reconnectAttempts = 0; // Reset on successful connection
          break;
        case 'DISCONNECTED':
          if (this.state !== AgoraServiceState.IDLE && this.state !== AgoraServiceState.ERROR) {
            this.handleDisconnection();
          }
          break;
        case 'RECONNECTING':
          if (this.state !== AgoraServiceState.RECONNECTING) {
            this.transitionTo(AgoraServiceState.RECONNECTING);
          }
          break;
      }
    };
    this.client.on('connection-state-change', connectionStateHandler);
    this.eventHandlers.set('connection-state-change', connectionStateHandler);

    // Remote user published
    const userPublishedHandler = async (user: any, mediaType: string) => {
      console.log(`[AgoraService] Remote user published: ${user.uid}, mediaType: ${mediaType}`);
      
      // Check if client still exists (might have been destroyed)
      if (!this.client) {
        console.warn('[AgoraService] Client is null, cannot subscribe to remote user');
        return;
      }
      
      try {
        await this.client.subscribe(user, mediaType);
        
        // After subscription, the track should be available on the user object
        const track = mediaType === 'video' ? user.videoTrack : user.audioTrack;
        if (!track) {
          console.warn(`[AgoraService] Track not available after subscription for ${user.uid}, ${mediaType}`);
          return;
        }
        
        const event: RemoteUserPublishedEvent = {
          uid: String(user.uid),
          mediaType: mediaType as 'audio' | 'video',
          user,
        };
        
        this.remoteUserPublishedCallbacks.forEach((callback) => {
          try {
            callback(event);
          } catch (err) {
            console.error('[AgoraService] Error in remote user published callback', err);
          }
        });
      } catch (error) {
        console.error('[AgoraService] Failed to subscribe to remote user', error);
        const serviceError = this.classifyError(error);
        this.emitError(serviceError);
      }
    };
    this.client.on('user-published', userPublishedHandler);
    this.eventHandlers.set('user-published', userPublishedHandler);

    // Remote user unpublished
    const userUnpublishedHandler = (user: any, mediaType: string) => {
      console.log(`[AgoraService] Remote user unpublished: ${user.uid}, mediaType: ${mediaType}`);
      
      // Check if client still exists
      if (!this.client) {
        return;
      }
      
      const event: RemoteUserUnpublishedEvent = {
        uid: String(user.uid),
        user,
      };
      
      this.remoteUserUnpublishedCallbacks.forEach((callback) => {
        try {
          callback(event);
        } catch (err) {
          console.error('[AgoraService] Error in remote user unpublished callback', err);
        }
      });
    };
    this.client.on('user-unpublished', userUnpublishedHandler);
    this.eventHandlers.set('user-unpublished', userUnpublishedHandler);

    // Exception handling
    const exceptionHandler = (event: any) => {
      console.error('[AgoraService] Agora exception:', event);
      
      // Check if client still exists
      if (!this.client) {
        return;
      }
      
      const serviceError = this.classifyError(event);
      this.emitError(serviceError);
    };
    this.client.on('exception', exceptionHandler);
    this.eventHandlers.set('exception', exceptionHandler);
  }

  /**
   * Remove event listeners
   */
  private removeEventListeners(): void {
    if (!this.client) return;

    this.eventHandlers.forEach((handler, eventName) => {
      try {
        this.client!.off(eventName as any, handler);
      } catch (error) {
        console.warn(`[AgoraService] Error removing ${eventName} listener`, error);
      }
    });

    this.eventHandlers.clear();
  }

  /**
   * Join Agora channel
   */
  private async joinChannel(uid: string, roomCode: string): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    this.transitionTo(AgoraServiceState.JOINING);

    try {
      await this.client.join(
        this.config.appId,
        `playroom-rpm-${roomCode}`,
        this.config.token ?? null,
        uid
      );

      // Don't transition to JOINED here - wait for connection-state-change to CONNECTED
      // The connection-state-change handler will transition to READY when CONNECTED
      // This ensures Agora is fully ready before we try to publish
    } catch (error) {
      const serviceError = this.classifyError(error);
      this.transitionTo(AgoraServiceState.ERROR, serviceError);
      throw error;
    }
  }

  /**
   * Queue video publish operation
   */
  publishVideo(stream: MediaStream): void {
    const [videoTrack] = stream.getVideoTracks();
    if (!videoTrack) {
      console.warn('[AgoraService] No video track in stream');
      return;
    }

    this.queueOperation({
      type: OperationType.PUBLISH_VIDEO,
      payload: { videoTrack },
      timestamp: Date.now(),
    });
  }

  /**
   * Execute video publish
   */
  private async doPublishVideo(payload: { videoTrack: MediaStreamTrack }): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    if (this.state !== AgoraServiceState.READY && this.state !== AgoraServiceState.PUBLISHED) {
      throw new Error(`Cannot publish video in state: ${this.state}`);
    }

    // If video track already exists, just enable/disable it
    if (this.tracks.videoTrack) {
      this.tracks.videoTrack.setEnabled(true);
      return;
    }

    this.transitionTo(AgoraServiceState.PUBLISHING);

    try {
      const customTrack = AgoraRTC.createCustomVideoTrack({
        mediaStreamTrack: payload.videoTrack.clone(),
      });

      this.tracks.videoTrack = customTrack;
      await this.client.publish([customTrack]);
      
      this.transitionTo(AgoraServiceState.PUBLISHED);
      console.log('[AgoraService] Video track published successfully');
    } catch (error) {
      const serviceError = this.classifyError(error);
      this.transitionTo(AgoraServiceState.READY, serviceError);
      
      // If it's "haven't joined yet", we'll retry when connection is ready
      if (serviceError.code === 'INVALID_OPERATION' && serviceError.message?.includes('joined')) {
        // Re-queue the operation
        this.queueOperation({
          type: OperationType.PUBLISH_VIDEO,
          payload,
          timestamp: Date.now(),
        });
      } else {
        throw error;
      }
    }
  }

  /**
   * Queue audio publish operation
   */
  publishAudio(): void {
    this.queueOperation({
      type: OperationType.PUBLISH_AUDIO,
      timestamp: Date.now(),
    });
  }

  /**
   * Execute audio publish
   */
  private async doPublishAudio(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    if (this.state !== AgoraServiceState.READY && this.state !== AgoraServiceState.PUBLISHED) {
      throw new Error(`Cannot publish audio in state: ${this.state}`);
    }

    if (this.tracks.audioTrack) {
      this.tracks.audioTrack.setEnabled(true);
      return;
    }

    try {
      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      this.tracks.audioTrack = audioTrack;
      await this.client.publish([audioTrack]);
      console.log('[AgoraService] Audio track published successfully');
    } catch (error) {
      const serviceError = this.classifyError(error);
      this.emitError(serviceError);
      throw error;
    }
  }

  /**
   * Queue video unpublish operation
   */
  unpublishVideo(): void {
    this.queueOperation({
      type: OperationType.UNPUBLISH_VIDEO,
      timestamp: Date.now(),
    });
  }

  /**
   * Execute video unpublish
   */
  private async doUnpublishVideo(): Promise<void> {
    if (!this.tracks.videoTrack || !this.client) {
      return;
    }

    try {
      await this.client.unpublish([this.tracks.videoTrack]);
      this.tracks.videoTrack.stop();
      this.tracks.videoTrack.close?.();
      delete this.tracks.videoTrack;
      
      if (this.state === AgoraServiceState.PUBLISHED) {
        this.transitionTo(AgoraServiceState.READY);
      }
      
      console.log('[AgoraService] Video track unpublished');
    } catch (error) {
      console.error('[AgoraService] Failed to unpublish video', error);
      // Clean up track even if unpublish fails
      if (this.tracks.videoTrack) {
        this.tracks.videoTrack.stop();
        this.tracks.videoTrack.close?.();
        delete this.tracks.videoTrack;
      }
    }
  }

  /**
   * Queue audio unpublish operation
   */
  unpublishAudio(): void {
    this.queueOperation({
      type: OperationType.UNPUBLISH_AUDIO,
      timestamp: Date.now(),
    });
  }

  /**
   * Execute audio unpublish
   */
  private async doUnpublishAudio(): Promise<void> {
    if (!this.tracks.audioTrack || !this.client) {
      return;
    }

    try {
      await this.client.unpublish([this.tracks.audioTrack]);
      this.tracks.audioTrack.stop();
      this.tracks.audioTrack.close?.();
      delete this.tracks.audioTrack;
      console.log('[AgoraService] Audio track unpublished');
    } catch (error) {
      console.error('[AgoraService] Failed to unpublish audio', error);
      // Clean up track even if unpublish fails
      if (this.tracks.audioTrack) {
        this.tracks.audioTrack.stop();
        this.tracks.audioTrack.close?.();
        delete this.tracks.audioTrack;
      }
    }
  }

  /**
   * Set audio track enabled state
   */
  setAudioEnabled(enabled: boolean): void {
    if (this.tracks.audioTrack) {
      this.tracks.audioTrack.setEnabled(enabled);
    }
  }

  /**
   * Set video track enabled state
   */
  setVideoEnabled(enabled: boolean): void {
    if (this.tracks.videoTrack) {
      this.tracks.videoTrack.setEnabled(enabled);
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnection(): void {
    if (this.currentUid && this.currentRoomCode) {
      this.pendingReconnect = {
        uid: this.currentUid,
        roomCode: this.currentRoomCode,
      };
      this.startReconnection();
    } else {
      this.transitionTo(AgoraServiceState.ERROR);
    }
  }

  /**
   * Start reconnection process
   */
  private startReconnection(): void {
    if (!this.pendingReconnect) {
      return;
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[AgoraService] Max reconnection attempts reached');
      this.transitionTo(AgoraServiceState.ERROR);
      this.pendingReconnect = null;
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.config.reconnectBackoffBase * Math.pow(2, this.reconnectAttempts - 1),
      this.config.reconnectBackoffMax
    );

    this.transitionTo(AgoraServiceState.RECONNECTING);

    const event: ReconnectionEvent = {
      attempt: this.reconnectAttempts,
      maxAttempts: this.config.maxReconnectAttempts,
      nextRetryDelay: delay,
    };

    this.reconnectionCallbacks.forEach((callback) => {
      try {
        callback(event);
      } catch (err) {
        console.error('[AgoraService] Error in reconnection callback', err);
      }
    });

    this.reconnectTimer = setTimeout(async () => {
      try {
        // Recreate client if needed
        if (!this.client) {
          await this.createClient();
        }

        // Rejoin channel
        await this.joinChannel(this.pendingReconnect!.uid, this.pendingReconnect!.roomCode);

        // Re-publish tracks if they existed
        if (this.tracks.audioTrack) {
          this.publishAudio();
        }
        // Video will be re-published by the component when it detects reconnection
      } catch (error) {
        console.error('[AgoraService] Reconnection failed', error);
        this.startReconnection(); // Retry
      }
    }, delay);
  }

  /**
   * Leave channel and cleanup
   */
  async leave(): Promise<void> {
    // Clear reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Clear operation queue
    this.operationQueue = [];
    this.isProcessingQueue = false;

    // Unpublish tracks
    if (this.tracks.videoTrack) {
      await this.doUnpublishVideo();
    }
    if (this.tracks.audioTrack) {
      await this.doUnpublishAudio();
    }

    // Remove event listeners before leaving
    this.removeEventListeners();

    // Leave channel
    if (this.client) {
      try {
        await this.client.leave();
      } catch (error) {
        console.error('[AgoraService] Error leaving channel', error);
      }
    }

    // Cleanup
    this.client = null;
    this.tracks = {};
    this.currentUid = null;
    this.currentRoomCode = null;
    this.pendingReconnect = null;
    this.reconnectAttempts = 0;

    this.transitionTo(AgoraServiceState.IDLE);
  }

  /**
   * Cleanup all resources
   */
  destroy(): void {
    this.leave();
    this.stateChangeCallbacks.clear();
    this.remoteUserPublishedCallbacks.clear();
    this.remoteUserUnpublishedCallbacks.clear();
    this.reconnectionCallbacks.clear();
    this.errorCallbacks.clear();
  }
}

