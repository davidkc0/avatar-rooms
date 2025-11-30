import { useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import AgoraManager from '../voice/agoraManager';
import micIconOn from '../assets/micIconOn.svg';
import micIconOff from '../assets/micIconOff.svg';
import speakerIconOn from '../assets/speakerIconOn.svg';
import speakerIconOff from '../assets/speakerIconOff.svg';
import { writeMyState } from '../multiplayer/playroom';
import { useVideoStore } from '../state/videoStore';
import '../utils/helpers'; // Import to ensure hashCode is available

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
  const joinPromiseRef = useRef<Promise<boolean | string> | null>(null);
  const joinTimeRef = useRef<number | null>(null);
  const remoteVideoElements = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [remoteTrack, setRemoteTrack] = useState<any>(null);
  const agoraClient = useRef<any>(null);
  const [micAllowed, setMicAllowed] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [spkOn, setSpkOn] = useState(true);
  const [engineReadyToken, setEngineReadyToken] = useState(0);
  const [videoRetryToken, setVideoRetryToken] = useState(0);
  const setRemoteVideo = useVideoStore((state) => state.setRemoteVideo);

  const attachRemoteVideo = (user: any) => {
    console.log('[VoiceChat] 🎬 attachRemoteVideo called for user:', user.uid);
    
    const track = user.videoTrack;
    if (!track) {
      console.error('[VoiceChat] ❌ No video track for user:', user.uid);
      return;
    }
    
    console.log('[VoiceChat] ✅ Video track found:', {
      uid: user.uid,
      trackId: track.getTrackId?.(),
      enabled: track.enabled,
    });
    
    const mediaTrack = track.getMediaStreamTrack();
    if (!mediaTrack) {
      console.error('[VoiceChat] ❌ No media stream track for user:', user.uid);
      return;
    }
    
    console.log('[VoiceChat] ✅ Media stream track found:', {
      id: mediaTrack.id,
      kind: mediaTrack.kind,
      readyState: mediaTrack.readyState,
    });
    
    const stream = new MediaStream([mediaTrack]);
    const video = document.createElement('video');
    video.style.position = 'absolute';
    video.style.left = '-9999px';
    video.style.width = '320px'; // Changed from 1px for debugging
    video.style.height = '320px'; // Changed from 1px for debugging
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    document.body.appendChild(video);
    
    video.play()
      .then(() => {
        console.log('[VoiceChat] ✅ Video playing:', {
          uid: user.uid,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState,
        });
      })
      .catch((err) => {
        console.error('[VoiceChat] ❌ Failed to play video:', err);
      });
    
    // Store by the string UID directly (as received from Agora)
    const uidKey = String(user.uid);
    console.log('[VoiceChat] 💾 Storing video with key:', uidKey);
    
    remoteVideoElements.current.set(uidKey, video);
    setRemoteVideo(uidKey, video);
    
    // Also log the entire videoStore state
    setTimeout(() => {
      const allVideos = useVideoStore.getState().remoteVideos;
      console.log('[VoiceChat] 📊 All videos in store:', Object.keys(allVideos));
    }, 100);
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

  // Helper function to check and subscribe to remote user's video
  const checkAndSubscribeRemoteUser = async (remoteUser: any, engine: any) => {
    const remoteUid = String(remoteUser.uid);
    
    // Skip our own user
    if (remoteUid === String(uid)) {
      return;
    }
    
    console.log('[VoiceChat] 📋 Processing remote user:', remoteUid, {
      hasVideo: !!remoteUser.hasVideo,
      hasAudio: !!remoteUser.hasAudio,
      videoTrack: !!remoteUser.videoTrack,
      audioTrack: !!remoteUser.audioTrack,
    });
    
    // Subscribe to video if available but not yet subscribed
    if (remoteUser.hasVideo && !remoteUser.videoTrack) {
      console.log('[VoiceChat] 📹 Subscribing to existing user video:', remoteUid);
      try {
        await engine.subscribe(remoteUser, 'video');
        console.log('[VoiceChat] ✅ Subscribed to video for:', remoteUid);
        // Small delay to ensure track is ready
        await new Promise(resolve => setTimeout(resolve, 100));
        attachRemoteVideo(remoteUser);
      } catch (err) {
        console.error('[VoiceChat] ❌ Failed to subscribe to video:', err);
      }
    } else if (remoteUser.videoTrack) {
      // Video track already available, attach it directly
      console.log('[VoiceChat] ✅ Video track already available for:', remoteUid);
      attachRemoteVideo(remoteUser);
    }
    
    // Subscribe to audio if available
    if (remoteUser.hasAudio && !remoteUser.audioTrack) {
      try {
        await engine.subscribe(remoteUser, 'audio');
        setRemoteTrack(remoteUser.audioTrack);
      } catch (err) {
        console.error('[VoiceChat] ❌ Failed to subscribe to audio:', err);
      }
    } else if (remoteUser.audioTrack) {
      setRemoteTrack(remoteUser.audioTrack);
    }
  };

  const handleVSDKEvents = (eventName: string, ...args: any[]) => {
    console.log('[VoiceChat] 🔔 Event:', eventName, 'Args:', args);
    
    switch (eventName) {
      case 'user-joined':
        // When a user joins, check if they have published media
        const joinedUser = args[0];
        const joinedUid = String(joinedUser.uid);
        
        if (joinedUid === String(uid)) {
          return; // Skip self
        }
        
        console.log('[VoiceChat] 👤 User joined:', joinedUid);
        // Check for existing published tracks
        const engine = agoraClient.current?.getAgoraEngine();
        if (engine) {
          checkAndSubscribeRemoteUser(joinedUser, engine);
        }
        break;
        
      case 'user-published':
        const remoteUid = args[0].uid;
        
        // CRITICAL: Ignore our own user-published events!
        if (String(remoteUid) === String(uid)) {
          console.log('[VoiceChat] 🚫 Ignoring self user-published event for:', remoteUid);
          return;
        }
        
        console.log('[VoiceChat] 📹 Remote user published:', {
          uid: remoteUid,
          mediaType: args[1],
          hasVideoTrack: !!args[0].videoTrack,
          hasAudioTrack: !!args[0].audioTrack,
        });
        
        if (args[1] === 'audio') {
          setRemoteTrack(args[0].audioTrack);
        }
        if (args[1] === 'video') {
          console.log('[VoiceChat] 🎥 Video track detected, attaching...');
          attachRemoteVideo(args[0]);
        }
        break;
        
      case 'user-unpublished':
        const unpublishUid = args[0]?.uid;
        
        // Also ignore our own unpublish events
        if (String(unpublishUid) === String(uid)) {
          console.log('[VoiceChat] 🚫 Ignoring self user-unpublished event for:', unpublishUid);
          return;
        }
        
        console.log('[VoiceChat] 📴 Remote user unpublished:', unpublishUid);
        detachRemoteVideo(String(unpublishUid));
        break;
        
      case 'user-left':
        const leftUid = args[0]?.uid;
        if (String(leftUid) !== String(uid)) {
          console.log('[VoiceChat] 👋 User left:', leftUid);
          detachRemoteVideo(String(leftUid));
        }
        break;
    }
  };

  useEffect(() => {
    if (channelParameters.localAudioTrack) {
        channelParameters.localAudioTrack.setEnabled(micOn);
    }
    // Update Playroom state to show who is talking/has mic on
    writeMyState({ withVoiceChat: micOn }).catch((error) => {
      console.error('[VoiceChat] Failed to update withVoiceChat state', error);
    });

    if (spkOn) {
      remoteTrack?.play();
    } else {
      remoteTrack?.stop();
    }
  }, [micOn, spkOn, remoteTrack, channelParameters]);

  const startVoiceChat = async () => {
    if (!uid || !roomCode) return;
    
    try {
        // CRITICAL: Use the string player ID directly (Agora accepts strings)
        console.log('[VoiceChat] Joining with string UID:', uid, 'from playerId:', uid);
        
        // Dynamically load AgoraManager to avoid errors if SDK fails or env missing
        if (!agoraClient.current) {
          agoraClient.current = await AgoraManager(handleVSDKEvents);
        }
        if (!agoraClient.current) return;

        joinPromiseRef.current = agoraClient.current.join(uid, `playroom-rpm-${roomCode}`, channelParameters);
        const result = await joinPromiseRef.current;

        // muted by default
        if (channelParameters.localAudioTrack) {
            channelParameters.localAudioTrack.setEnabled(false);
        }

        const joined = result === true;
        hasJoinedRef.current = joined;

        // mic state based on result
        setMicAllowed(joined);
        if (joined) {
          joinTimeRef.current = Date.now();
          setEngineReadyToken((v) => v + 1);
          
          // CRITICAL: Check for existing remote users who may have already published
          // This handles the case where we join after other users have published
          // We check multiple times with delays because remoteUsers might not be populated immediately
          const engine = agoraClient.current?.getAgoraEngine();
          if (engine) {
            const checkRemoteUsers = async (attempt = 1, maxAttempts = 5) => {
              // Wait a bit for Agora to populate remoteUsers (increases with each attempt)
              await new Promise(resolve => setTimeout(resolve, 200 * attempt));
              
              const remoteUsers = engine.remoteUsers;
              console.log(`[VoiceChat] 🔍 Checking for existing remote users (attempt ${attempt}/${maxAttempts}):`, remoteUsers.length);
              
              if (remoteUsers.length > 0) {
                // Process all remote users
                for (const remoteUser of remoteUsers) {
                  await checkAndSubscribeRemoteUser(remoteUser, engine);
                }
              } else if (attempt < maxAttempts) {
                // Retry if no users found yet
                console.log('[VoiceChat] ⏳ No remote users yet, retrying...');
                checkRemoteUsers(attempt + 1, maxAttempts);
              } else {
                console.log('[VoiceChat] ✅ Finished checking for remote users');
              }
            };
            
            // Start checking immediately and with retries
            checkRemoteUsers();
          }
        } else {
          joinTimeRef.current = null;
        }
    } catch (err) {
        console.error("Failed to start voice chat", err);
        joinPromiseRef.current = null;
        hasJoinedRef.current = false;
        joinTimeRef.current = null;
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

      joinPromiseRef.current = null;

      if (agoraClient.current) {
        agoraClient.current.leave(channelParameters);
      }
      hasJoinedRef.current = false;
      joinTimeRef.current = null;
    };
  }, [uid, roomCode]);

  useEffect(() => {
    let cancelled = false;

    const cleanupVideoTrack = async () => {
      const engine = agoraClient.current?.getAgoraEngine();
      if (!channelParameters.localVideoTrack) {
        return;
      }
      try {
        if (engine && hasJoinedRef.current) {
          await engine.unpublish([channelParameters.localVideoTrack]);
          console.log('[VoiceChat] Unpublished video track');
        }
      } catch (err) {
        console.warn('[VoiceChat] Unpublish video failed', err);
      }
      channelParameters.localVideoTrack.stop();
      channelParameters.localVideoTrack.close?.();
      delete channelParameters.localVideoTrack;
    };

    if (!cameraEnabled || !cameraStream) {
      cleanupVideoTrack();
      return () => {
        cancelled = true;
      };
    }

    const publishVideo = async () => {
      if (!hasJoinedRef.current) {
        console.log('[VoiceChat] Skipping video publish: not joined yet');
        return;
      }

      // Give Agora a bit of time after join before first video publish to avoid
      // INVALID_OPERATION: Can't publish stream, haven't joined yet!
      if (joinTimeRef.current !== null && Date.now() - joinTimeRef.current < 1500) {
        console.log('[VoiceChat] Delaying video publish until join is fully settled');
        if (!cancelled) {
          setTimeout(() => {
            setVideoRetryToken((token) => token + 1);
          }, 500);
        }
        return;
      }

      if (joinPromiseRef.current) {
        try {
          const joinResult = await joinPromiseRef.current;
          if (joinResult !== true || cancelled) {
            return;
          }
        } catch (err) {
          console.error('[VoiceChat] Join promise rejected, cannot publish video', err);
          return;
        }
      }

      const engine = agoraClient.current?.getAgoraEngine();
      if (!engine || cancelled) {
        return;
      }

      const [videoTrack] = cameraStream.getVideoTracks();
      if (!videoTrack) {
        console.warn('[VoiceChat] No video track in cameraStream');
        return;
      }

      if (channelParameters.localVideoTrack) {
        channelParameters.localVideoTrack.setEnabled(cameraEnabled);
        console.log('[VoiceChat] Video track enabled:', cameraEnabled);
        return;
      }

      console.log('[VoiceChat] Creating and publishing video track');
      const customTrack = AgoraRTC.createCustomVideoTrack({
        mediaStreamTrack: videoTrack.clone(),
      });
      channelParameters.localVideoTrack = customTrack;
      try {
        await engine.publish([customTrack]);
        console.log('[VoiceChat] Video track published successfully');
      } catch (err) {
        console.error('[VoiceChat] Failed to publish video track', err);
        customTrack.stop();
        customTrack.close?.();
        delete channelParameters.localVideoTrack;

        if (!cancelled) {
          setTimeout(() => {
            setVideoRetryToken((token) => token + 1);
          }, 500);
        }
      }
    };

    publishVideo();

    return () => {
      cancelled = true;
    };
  }, [cameraEnabled, cameraStream, engineReadyToken, videoRetryToken]);

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

