import AgoraRTC, { type IAgoraRTCClient } from 'agora-rtc-sdk-ng';

const APP_ID = import.meta.env.VITE_AGORA_APP_ID || '';
const FALLBACK_TOKEN = import.meta.env.VITE_AGORA_TEMP_TOKEN || null;

export type AgoraContextType = {
  getAgoraEngine: () => IAgoraRTCClient | null;
  config: { appId: string; channelName: string; token: string | null };
  join: (uid: string, channel: string, channelParameters: any) => Promise<boolean | string>;
  leave: (channelParameters: any) => Promise<void>;
};

const AgoraManager = async (eventsCallback: (event: string, ...args: any[]) => void): Promise<AgoraContextType> => {
  let agoraEngine: IAgoraRTCClient | null = null;

  const setupAgoraEngine = async () => {
    agoraEngine = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
  };
  await setupAgoraEngine();

  if (!agoraEngine) throw new Error("Failed to create Agora client");

  agoraEngine.on('user-published', async (user, mediaType) => {
    console.log('[AgoraManager] user-published - UID:', user.uid, 'mediaType:', mediaType);
    await agoraEngine!.subscribe(user, mediaType);
    console.log('[AgoraManager] Subscribed to', mediaType, 'for user:', user.uid, 'hasTrack:', mediaType === 'video' ? !!user.videoTrack : !!user.audioTrack);
    eventsCallback('user-published', user, mediaType);
  });

  agoraEngine.on('user-unpublished', (user) => {
    console.log(user.uid + ' has left the channel');
    eventsCallback('user-unpublished', user);
  });

  const getAgoraEngine = () => agoraEngine;

  const config = {
    appId: APP_ID,
    channelName: '',
    token: null,
  };

  const join = async (uid: string, channel: string, channelParameters: any) => {
    if (!APP_ID) {
      console.error("Agora App ID missing");
      return false;
    }

    config.channelName = channel;
    config.token = FALLBACK_TOKEN;

    await agoraEngine!.join(
      config.appId,
      config.channelName,
      config.token ?? null,
      uid
    );

    try {
      channelParameters.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      await agoraEngine!.publish([channelParameters.localAudioTrack]);
      return true;
    } catch (e: any) {
      console.error("Agora publish error", e);
      return e.code || 'ERROR';
    }
  };

  const leave = async (channelParameters: any) => {
    if (channelParameters.localAudioTrack) {
      channelParameters.localAudioTrack.close();
    }
    await agoraEngine!.leave();
  };

  return {
    getAgoraEngine,
    config,
    join,
    leave,
  };
};

export default AgoraManager;

