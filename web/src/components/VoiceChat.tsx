import { useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import AgoraManager from '../voice/agoraManager';
import micIconOn from '../assets/micIconOn.svg';
import micIconOff from '../assets/micIconOff.svg';
import speakerIconOn from '../assets/speakerIconOn.svg';
import speakerIconOff from '../assets/speakerIconOff.svg';
import { updateMyNode } from '../multiplayer/playroom';
import { useVideoStore } from '../state/videoStore';

interface VoiceChatProps {
  uid: string;
  roomCode: string;
  cameraStream?: MediaStream | null;
  cameraEnabled: boolean;
}

type ChannelParams = {
  localAudioTrack?: ReturnType<typeof AgoraRTC.createMicrophoneAudioTrack>;
  localVideoTrack?: ReturnType<typeof AgoraRTC.createCustomVideoTrack>;
};

export const VoiceChat = ({
  uid,
  roomCode,
  cameraStream,
  cameraEnabled,
}: VoiceChatProps) => {
  const channelParameters = useRef<ChannelParams>({}).current;
  const hasJoinedRef = useRef(false);
  const remoteVideoElements = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [remoteTrack, setRemoteTrack] = useState<any>(null);
  const agoraClient = useRef<any>(null);
  const [micAllowed, setMicAllowed] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [spkOn, setSpkOn] = useState(true);
  const [engineReadyToken, setEngineReadyToken] = useState(0);
  const setRemoteVideo = useVideoStore((state) => state.setRemoteVideo);

  const attachRemoteVideo = (user: any) => {
    const track = user.videoTrack;
    if (!track) return;
    const mediaTrack = track.getMediaStreamTrack();
    if (!mediaTrack) return;
    const stream = new MediaStream([mediaTrack]);
    const video = document.createElement('video');
    video.style.position = 'absolute';
    video.style.left = '-9999px';
    video.style.width = '1px';
    video.style.height = '1px';
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    document.body.appendChild(video);
    video.play().catch((err) => {
      console.warn('[VoiceChat] Failed to autoplay remote video', err);
    });
    const playerId = String(user.uid);
    remoteVideoElements.current.set(playerId, video);
    setRemoteVideo(playerId, video);
  };

  const detachRemoteVideo = (playerId: string) => {
    const el = remoteVideoElements.current.get(playerId);
    if (el) {
      el.pause();
      el.srcObject = null;
      if (el.parentElement) {
        el.parentElement.removeChild(el);
      }
      remoteVideoElements.current.delete(playerId);
    }
    setRemoteVideo(playerId, null);
  };

  const handleVSDKEvents = (eventName: string, ...args: any[]) => {
    switch (eventName) {
      case 'user-published':
        if (args[1] === 'audio') {
          setRemoteTrack(args[0].audioTrack);
        }
        if (args[1] === 'video') {
          attachRemoteVideo(args[0]);
        }
        break;
      case 'user-unpublished':
        detachRemoteVideo(String(args[0]?.uid));
        break;
    }
  };

  useEffect(() => {
    if (channelParameters.localAudioTrack) {
        channelParameters.localAudioTrack.setEnabled(micOn);
    }
    // Update Playroom state to show who is talking/has mic on
    updateMyNode((state) => ({ ...state, withVoiceChat: micOn }));

    if (spkOn) {
      remoteTrack?.play();
    } else {
      remoteTrack?.stop();
    }
  }, [micOn, spkOn, remoteTrack, channelParameters]);

  const startVoiceChat = async () => {
    if (!uid || !roomCode) return;
    
    try {
        // Dynamically load AgoraManager to avoid errors if SDK fails or env missing
        agoraClient.current = await AgoraManager(handleVSDKEvents);
        if (!agoraClient.current) return;

        const result = await agoraClient.current.join(uid, `playroom-rpm-${roomCode}`, channelParameters);

        // muted by default
        if (channelParameters.localAudioTrack) {
            channelParameters.localAudioTrack.setEnabled(false);
        }

        const joined = result === true;
        hasJoinedRef.current = joined;

        // mic state based on result
        setMicAllowed(joined);
        if (joined) {
          setEngineReadyToken((v) => v + 1);
        }
    } catch (err) {
        console.error("Failed to start voice chat", err);
        hasJoinedRef.current = false;
    }
  };

  useEffect(() => {
    startVoiceChat();

    return () => {
      remoteVideoElements.current.forEach((_, playerId) =>
        detachRemoteVideo(playerId)
      );

      if (channelParameters.localVideoTrack) {
        try {
          agoraClient.current
            ?.getAgoraEngine()
            ?.unpublish([channelParameters.localVideoTrack]);
        } catch (err) {
          console.warn('[VoiceChat] Unpublish video on cleanup failed', err);
        }
        channelParameters.localVideoTrack.stop();
        channelParameters.localVideoTrack.close?.();
        delete channelParameters.localVideoTrack;
      }

      if (agoraClient.current) {
        agoraClient.current.leave(channelParameters);
      }
      hasJoinedRef.current = false;
    };
  }, [uid, roomCode]);

  useEffect(() => {
    const engine = agoraClient.current?.getAgoraEngine();
    if (!engine || !hasJoinedRef.current) return;

    const publishVideo = async () => {
      if (!cameraEnabled || !cameraStream) {
        if (channelParameters.localVideoTrack) {
          try {
            await engine.unpublish([channelParameters.localVideoTrack]);
          } catch (err) {
            console.warn('[VoiceChat] Unpublish video failed', err);
          }
          channelParameters.localVideoTrack.stop();
          channelParameters.localVideoTrack.close?.();
          delete channelParameters.localVideoTrack;
        }
        return;
      }

      if (channelParameters.localVideoTrack) {
        channelParameters.localVideoTrack.setEnabled(cameraEnabled);
        return;
      }

      const [videoTrack] = cameraStream.getVideoTracks();
      if (!videoTrack) return;

      const customTrack = AgoraRTC.createCustomVideoTrack({
        mediaStreamTrack: videoTrack.clone(),
      });
      channelParameters.localVideoTrack = customTrack;
      try {
        await engine.publish([customTrack]);
      } catch (err) {
        console.error('[VoiceChat] Failed to publish video track', err);
      }
    };

    publishVideo();
  }, [cameraEnabled, cameraStream, channelParameters, engineReadyToken]);

  const toggleMic = () => {
    if (!micAllowed) return;
    setMicOn((v) => !v);
  };

  const toggleSpk = () => {
    setSpkOn((v) => !v);
  };

  // Don't render anything if no Agora App ID is configured
  if (!import.meta.env.VITE_AGORA_APP_ID) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 pointer-events-auto">
      <button
        className={`select-none rounded-full h-12 w-12 flex justify-center items-center bg-black/50 backdrop-blur-md border border-white/10 active:scale-95 transition-transform shadow-lg`}
        onClick={toggleSpk}
        title={spkOn ? "Mute Speakers" : "Unmute Speakers"}
      >
        <img src={spkOn ? speakerIconOn : speakerIconOff} className={`w-6 h-6 ${spkOn ? 'opacity-100' : 'opacity-50'}`} alt="Speaker" />
      </button>
      <button
        className={`select-none rounded-full h-12 w-12 flex justify-center items-center bg-black/50 backdrop-blur-md border border-white/10 active:scale-95 transition-transform shadow-lg ${!micAllowed ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={toggleMic}
        disabled={!micAllowed}
        title={micOn ? "Mute Mic" : "Unmute Mic"}
      >
        <img src={micOn ? micIconOn : micIconOff} className={`w-6 h-6 ${micOn ? 'opacity-100' : 'opacity-50'}`} alt="Mic" />
      </button>
    </div>
  );
};

